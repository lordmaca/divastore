import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  InvoiceStatus,
  OrderEventType,
  OrderStatus,
  NotificationChannel,
} from "@/lib/generated/prisma/enums";
import { recordOrderEvent } from "@/lib/order-events";
import { sendSafe } from "@/lib/notifications/dispatch";
import { absoluteUrl } from "@/lib/notifications/templates/shared";
import {
  tinyEmitirNotaFiscal,
  tinyObterNotaFiscal,
  tinyCancelarNotaFiscal,
  type InvoiceSnapshot,
} from "@/lib/integration/tiny/invoices";

// Orchestrates NF-e issuance. Callable from:
//   - MP webhook (auto after payment approval)
//   - admin "Emitir NF-e" button
//   - `./scripts/bdd invoice <n>` manual trigger
//
// Idempotent: returns the existing Invoice row when one is already
// REQUESTED / ISSUED. Only FAILED or CANCELLED invoices are re-issued.
export async function issueInvoice(
  orderId: string,
  opts: { actor: string; reason?: "auto" | "manual" | "cli" } = { actor: "system" },
): Promise<{ ok: true; invoiceId: string; reused: boolean } | { ok: false; reason: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      status: true,
      tinyOrderId: true,
      invoices: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.status !== OrderStatus.PAID) return { ok: false, reason: "order_not_paid" };
  if (!order.tinyOrderId) return { ok: false, reason: "order_not_published_to_tiny" };

  const existing = order.invoices[0];
  if (
    existing &&
    (existing.status === InvoiceStatus.REQUESTED ||
      existing.status === InvoiceStatus.ISSUED)
  ) {
    return { ok: true, invoiceId: existing.id, reused: true };
  }

  let emission: Awaited<ReturnType<typeof tinyEmitirNotaFiscal>>;
  try {
    emission = await tinyEmitirNotaFiscal(order.tinyOrderId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Still record an Invoice row so the admin sees the attempt + reason.
    const failed = await prisma.invoice.create({
      data: {
        orderId,
        provider: "tiny",
        status: InvoiceStatus.FAILED,
        lastError: msg.slice(0, 500),
        attempts: 1,
      },
    });
    await recordOrderEvent(orderId, OrderEventType.INVOICE_FAILED, {
      actor: opts.actor,
      message: `Falha ao emitir NF-e: ${msg.slice(0, 120)}`,
      metadata: { invoiceId: failed.id, reason: opts.reason ?? "auto" },
    });
    await prisma.integrationRun.create({
      data: {
        adapter: "tiny",
        operation: "invoice.emit",
        status: "error",
        error: msg.slice(0, 500),
        payload: { orderId, tinyOrderId: order.tinyOrderId },
      },
    });
    return { ok: false, reason: "tiny_error" };
  }

  const invoice = await prisma.invoice.create({
    data: {
      orderId,
      provider: "tiny",
      providerInvoiceId: emission.tinyInvoiceId,
      status:
        emission.situacao === "issued"
          ? InvoiceStatus.ISSUED
          : emission.situacao === "failed"
            ? InvoiceStatus.FAILED
            : InvoiceStatus.REQUESTED,
      attempts: 1,
      rawPayload: emission.rawPayload as Prisma.InputJsonValue,
    },
  });
  await recordOrderEvent(orderId, OrderEventType.INVOICE_REQUESTED, {
    actor: opts.actor,
    message: `NF-e solicitada no Tiny (situacao=${emission.situacao})`,
    metadata: {
      invoiceId: invoice.id,
      tinyInvoiceId: emission.tinyInvoiceId,
      reason: opts.reason ?? "auto",
    },
  });
  await prisma.integrationRun.create({
    data: {
      adapter: "tiny",
      operation: "invoice.emit",
      status: "ok",
      payload: {
        orderId,
        tinyOrderId: order.tinyOrderId,
        tinyInvoiceId: emission.tinyInvoiceId,
        situacao: emission.situacao,
      },
    },
  });

  // Tiny sometimes flips straight to autorizada on the first call — in
  // that case, the emission already came back with full detail. The poll
  // path still runs on the next cron to fill number/key/URLs.
  return { ok: true, invoiceId: invoice.id, reused: false };
}

// Poll-path reconciliation: given an Invoice id, ask Tiny for the latest
// state and promote the row to ISSUED / FAILED / CANCELLED as appropriate.
// Fires `invoice_issued` email when transitioning REQUESTED → ISSUED.
export async function reconcileInvoice(invoiceId: string): Promise<{
  changed: boolean;
  status: InvoiceStatus;
}> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      order: {
        select: {
          id: true,
          number: true,
          customerId: true,
          shippingAddress: true,
          customer: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  if (!invoice.providerInvoiceId) throw new Error(`Invoice ${invoiceId} has no providerInvoiceId`);

  let snap: InvoiceSnapshot;
  try {
    snap = await tinyObterNotaFiscal(invoice.providerInvoiceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        lastError: msg.slice(0, 500),
        attempts: invoice.attempts + 1,
      },
    });
    throw err;
  }

  const newStatus: InvoiceStatus =
    snap.situacao === "issued"
      ? InvoiceStatus.ISSUED
      : snap.situacao === "cancelled"
        ? InvoiceStatus.CANCELLED
        : snap.situacao === "failed"
          ? InvoiceStatus.FAILED
          : InvoiceStatus.REQUESTED;

  const changed = newStatus !== invoice.status;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: newStatus,
      number: snap.number ?? invoice.number,
      serie: snap.serie ?? invoice.serie,
      accessKey: snap.accessKey ?? invoice.accessKey,
      xmlUrl: snap.xmlUrl ?? invoice.xmlUrl,
      danfeUrl: snap.danfeUrl ?? invoice.danfeUrl,
      issuedAt: newStatus === InvoiceStatus.ISSUED ? invoice.issuedAt ?? new Date() : invoice.issuedAt,
      attempts: invoice.attempts + 1,
      lastError: null,
      rawPayload: snap.rawPayload as Prisma.InputJsonValue,
    },
  });

  if (changed && newStatus === InvoiceStatus.ISSUED) {
    await recordOrderEvent(invoice.orderId, OrderEventType.INVOICE_ISSUED, {
      actor: "cron:invoice-poll",
      message: `NF-e ${snap.number ?? ""}${snap.serie ? "/" + snap.serie : ""} autorizada`,
      metadata: {
        invoiceId,
        tinyInvoiceId: invoice.providerInvoiceId,
        number: snap.number,
        serie: snap.serie,
        accessKey: snap.accessKey,
      },
    });
    const addr = (invoice.order?.shippingAddress ?? {}) as { recipient?: string };
    const recipient = invoice.order?.customer?.email ?? null;
    if (invoice.order && recipient && snap.danfeUrl) {
      await sendSafe({
        channel: NotificationChannel.EMAIL,
        template: "invoice_issued",
        data: {
          customerName: invoice.order.customer?.name ?? addr.recipient ?? null,
          orderNumber: invoice.order.number,
          invoiceNumber: snap.number,
          serie: snap.serie,
          danfeUrl: snap.danfeUrl,
          xmlUrl: snap.xmlUrl,
          orderUrl: absoluteUrl(`/minha-conta/pedidos/${invoice.orderId}`),
        },
        recipient,
        customerId: invoice.order.customerId,
        orderId: invoice.orderId,
      });
    }
  } else if (changed && newStatus === InvoiceStatus.FAILED) {
    await recordOrderEvent(invoice.orderId, OrderEventType.INVOICE_FAILED, {
      actor: "cron:invoice-poll",
      message: "NF-e rejeitada pela SEFAZ",
      metadata: { invoiceId, tinyInvoiceId: invoice.providerInvoiceId },
    });
  } else if (changed && newStatus === InvoiceStatus.CANCELLED) {
    await recordOrderEvent(invoice.orderId, OrderEventType.INVOICE_CANCELLED, {
      actor: "cron:invoice-poll",
      message: "NF-e cancelada",
      metadata: { invoiceId, tinyInvoiceId: invoice.providerInvoiceId },
    });
  }

  return { changed, status: newStatus };
}

export async function cancelInvoice(
  invoiceId: string,
  opts: { actor: string; reason: string },
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  if (!invoice.providerInvoiceId) throw new Error(`Invoice ${invoiceId} has no providerInvoiceId`);
  if (invoice.status !== InvoiceStatus.ISSUED) {
    throw new Error(`Invoice ${invoiceId} is not ISSUED (current: ${invoice.status})`);
  }

  await tinyCancelarNotaFiscal(invoice.providerInvoiceId, opts.reason);

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: InvoiceStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: opts.reason,
    },
  });
  await recordOrderEvent(invoice.orderId, OrderEventType.INVOICE_CANCELLED, {
    actor: opts.actor,
    message: `NF-e cancelada: ${opts.reason}`,
    metadata: { invoiceId, reason: opts.reason },
  });
}

// Poll sweeper helper — used by the cron script and `bdd invoice-poll`.
export async function sweepPendingInvoices(limit = 20): Promise<{
  processed: number;
  promoted: number;
  failed: number;
}> {
  const cutoff = new Date(Date.now() - 60_000); // ignore rows created <60s ago
  const rows = await prisma.invoice.findMany({
    where: { status: InvoiceStatus.REQUESTED, createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let promoted = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const res = await reconcileInvoice(r.id);
      if (res.changed && res.status === InvoiceStatus.ISSUED) promoted++;
      if (res.changed && res.status === InvoiceStatus.FAILED) failed++;
    } catch (err) {
      console.error(`[invoice-poll] reconcile ${r.id} failed`, err);
    }
  }
  return { processed: rows.length, promoted, failed };
}

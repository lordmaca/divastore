"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { publishOrderToErp } from "@/lib/integration/publish-order";
import { prisma } from "@/lib/db";
import {
  OrderStatus,
  NotificationChannel,
  StockSyncSource,
  OrderEventType,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/generated/prisma/enums";
import { sendSafe } from "@/lib/notifications/dispatch";
import { absoluteUrl } from "@/lib/notifications/templates/shared";
import { notifyAdminNewOrder } from "@/lib/notifications/admin-order";
import { recordOrderEvent } from "@/lib/order-events";
import { buildFullCatalogSnapshot } from "@/lib/integration/tiny/stock-fetch";
import {
  reconcileStockFromTiny,
  summarize,
  outcomeAsPayload,
  type Outcome,
} from "@/lib/integration/tiny/stock-reconcile";
import {
  issueInvoice,
  cancelInvoice,
  reconcileInvoice,
} from "@/lib/invoices";
import { refundPayment } from "@/lib/refunds";
import { purchaseShippingLabel } from "@/lib/shipments";
import { quoteForVariants } from "@/lib/shipping";
import { normalizeCep } from "@/lib/address";
import {
  canDeleteOrder,
  softDeleteOrder,
  REASON_LABEL,
  type DeleteRefusal,
} from "@/lib/orders/delete";
import {
  scanAllProducts,
  applyAllHighConfidenceIssues,
} from "@/lib/catalog/scan";
import { CategoryIssueStatus } from "@/lib/generated/prisma/enums";
import {
  setSecret,
  clearSecret,
  recordSettingChange,
  type SecretKey,
} from "@/lib/settings/config";
import { setSetting, type SettingKey, type SettingValue } from "@/lib/settings";
import { sendEmail, emailConfigured } from "@/lib/notifications/channels/email";

export async function retryPublishOrder(orderId: string) {
  await requireAdmin();
  const result = await publishOrderToErp(orderId);
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/integrations");
  return result;
}

export async function clearTinyMappingForOrder(orderId: string) {
  await requireAdmin();
  await prisma.order.update({ where: { id: orderId }, data: { tinyOrderId: null } });
  revalidatePath("/admin/pedidos");
}

// Admin action: manually mark an order as PAID. Used when payment arrived
// off-platform (e.g. bank transfer, in-person Pix) or when the MP webhook
// silently failed and the team confirmed the payment by other means. Mirrors
// the MP webhook side effects: flips order status, records a "manual" Payment
// row as APPROVED, logs the event, publishes to Tiny, auto-issues NF-e (if
// enabled), and fires the customer "payment approved" email. Idempotent:
// re-running on an already-PAID order is a no-op.
export async function markOrderPaid(orderId: string) {
  const admin = await requireAdmin();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      status: true,
      totalCents: true,
      customerId: true,
      shippingAddress: true,
      customer: { select: { email: true, name: true } },
      payments: { select: { id: true, status: true } },
    },
  });
  if (!order) throw new Error("Pedido não encontrado");
  if (order.status === OrderStatus.PAID) return { ok: true, alreadyPaid: true };
  if (
    order.status === OrderStatus.CANCELLED ||
    order.status === OrderStatus.REFUNDED
  ) {
    throw new Error(
      "Pedido cancelado ou reembolsado não pode ser marcado como pago",
    );
  }

  // Reuse an existing PENDING payment if one exists, otherwise create a
  // new "manual" one. Either way the row ends up APPROVED.
  const pendingPayment = order.payments.find(
    (p) => p.status === PaymentStatus.PENDING || p.status === PaymentStatus.IN_PROCESS,
  );
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        lastPaymentStatus: PaymentStatus.APPROVED,
      },
    }),
    pendingPayment
      ? prisma.payment.update({
          where: { id: pendingPayment.id },
          data: { status: PaymentStatus.APPROVED },
        })
      : prisma.payment.create({
          data: {
            orderId: order.id,
            provider: "manual",
            providerId: `manual:${order.id}:${Date.now()}`,
            method: PaymentMethod.PIX,
            status: PaymentStatus.APPROVED,
            amountCents: order.totalCents,
          },
        }),
  ]);

  await recordOrderEvent(order.id, OrderEventType.PAYMENT_APPROVED, {
    actor: `admin:${admin.user.id}`,
    message: `Pagamento confirmado manualmente pelo admin · R$${(order.totalCents / 100).toFixed(2)}`,
    metadata: { manual: true, amountCents: order.totalCents },
  });

  // Publish to Tiny — same as the MP webhook does on APPROVED.
  try {
    await publishOrderToErp(order.id);
  } catch (err) {
    console.error("[markOrderPaid] publishOrderToErp failed", err);
  }

  // Auto-issue NF-e if the flag is on. Failure here is non-fatal.
  try {
    const cfg = await (await import("@/lib/settings")).getSetting("invoice.autoIssueOnPaid");
    if (cfg.enabled) {
      const res = await issueInvoice(order.id, {
        actor: `admin:${admin.user.id}`,
        reason: "manual",
      });
      if (!res.ok) console.warn(`[markOrderPaid] auto-issue skipped: ${res.reason}`);
    }
  } catch (err) {
    console.error("[markOrderPaid] auto-issue invoice failed", err);
  }

  // Notify the customer the same way the MP webhook would.
  if (order.customer?.email) {
    await sendSafe({
      channel: NotificationChannel.EMAIL,
      template: "payment_approved",
      data: {
        customerName: order.customer.name,
        orderNumber: order.number,
        totalCents: order.totalCents,
        orderUrl: absoluteUrl(`/minha-conta/pedidos/${order.id}`),
      },
      recipient: order.customer.email,
      customerId: order.customerId,
      orderId: order.id,
    });
  }

  // Also notify the admin team — same idempotency as the webhook path.
  await notifyAdminNewOrder(order.id);

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${order.id}`);
  revalidatePath(`/minha-conta/pedidos/${order.id}`);
  return { ok: true };
}

// Admin action: mark an order as SHIPPED. Persists tracking code + URL and
// fires the order_shipped email. Idempotent — the Notification unique
// constraint guarantees we never double-send the "shipped" event.
export async function markOrderShipped(
  orderId: string,
  input: { trackingCode: string; trackingUrl?: string; carrier?: string; etaDays?: number },
) {
  await requireAdmin();
  const trackingCode = input.trackingCode.trim();
  if (!trackingCode) throw new Error("Código de rastreio obrigatório");

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.SHIPPED,
      trackingCode,
      trackingUrl: input.trackingUrl?.trim() || null,
      shippingCarrier: input.carrier?.trim() || undefined,
      shippingEtaDays: input.etaDays ?? undefined,
    },
    select: {
      id: true,
      number: true,
      customerId: true,
      trackingCode: true,
      trackingUrl: true,
      shippingCarrier: true,
      shippingEtaDays: true,
      customer: { select: { email: true, name: true } },
    },
  });

  if (updated.customer?.email && updated.trackingCode) {
    await sendSafe({
      channel: NotificationChannel.EMAIL,
      template: "order_shipped",
      data: {
        customerName: updated.customer.name,
        orderNumber: updated.number,
        carrier: updated.shippingCarrier,
        trackingCode: updated.trackingCode,
        trackingUrl: updated.trackingUrl,
        etaDays: updated.shippingEtaDays,
      },
      recipient: updated.customer.email,
      customerId: updated.customerId,
      orderId: updated.id,
    });
  }

  const adminId = (await requireAdmin()).user.id;
  await recordOrderEvent(updated.id, OrderEventType.SHIPPED, {
    actor: `admin:${adminId}`,
    message: `Pedido enviado · ${updated.shippingCarrier ?? "transportadora não informada"} · ${updated.trackingCode}`,
    metadata: {
      trackingCode: updated.trackingCode,
      trackingUrl: updated.trackingUrl,
      carrier: updated.shippingCarrier,
      etaDays: updated.shippingEtaDays,
    },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath(`/minha-conta/pedidos/${orderId}`);
}

// Category audit actions — used by /admin/produtos/categorias.

export async function runCategoryScanAction(): Promise<{
  scanned: number;
  opened: number;
  autoApplied: number;
  resolved: number;
  skipped: number;
}> {
  await requireAdmin();
  const out = await scanAllProducts();
  revalidatePath("/admin/produtos/categorias");
  return out;
}

export async function applyCategorySuggestionAction(issueId: string): Promise<void> {
  const admin = await requireAdmin();
  const issue = await prisma.categoryAuditIssue.findUnique({ where: { id: issueId } });
  if (!issue) throw new Error("issue_not_found");
  if (!issue.suggestedCategoryId) throw new Error("no_suggestion");
  if (issue.status !== CategoryIssueStatus.OPEN) throw new Error("already_resolved");

  await prisma.$transaction([
    prisma.product.update({
      where: { id: issue.productId },
      data: { categoryId: issue.suggestedCategoryId },
    }),
    prisma.categoryAuditIssue.update({
      where: { id: issueId },
      data: {
        status: CategoryIssueStatus.RESOLVED,
        resolvedBy: `admin:${admin.user.id}`,
        resolvedAt: new Date(),
      },
    }),
  ]);
  revalidatePath("/admin/produtos/categorias");
}

export async function dismissCategoryIssueAction(
  issueId: string,
  reason: string,
): Promise<void> {
  const admin = await requireAdmin();
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new Error("reason_too_short");
  await prisma.categoryAuditIssue.update({
    where: { id: issueId },
    data: {
      status: CategoryIssueStatus.DISMISSED,
      dismissalReason: trimmed,
      resolvedBy: `admin:${admin.user.id}`,
      resolvedAt: new Date(),
    },
  });
  revalidatePath("/admin/produtos/categorias");
}

export async function applyAllHighConfidenceAction(): Promise<{ applied: number }> {
  const admin = await requireAdmin();
  const applied = await applyAllHighConfidenceIssues(`admin:${admin.user.id}`);
  revalidatePath("/admin/produtos/categorias");
  return { applied };
}

// Admin "Excluir pedido" trigger. Soft delete, guardrailed against
// fiscal/shipment/payment integrity violations.
export async function deleteOrderAction(input: {
  orderId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; reason: DeleteRefusal; message: string }> {
  const admin = await requireAdmin();
  const res = await softDeleteOrder({
    orderId: input.orderId,
    reason: input.reason,
    actor: `admin:${admin.user.id}`,
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${input.orderId}`);
  if (res.ok) return { ok: true };
  return { ok: false, reason: res.reason, message: REASON_LABEL[res.reason] };
}

// Read-only check, used by the delete button to show why deletion is
// disabled before the admin types anything.
export async function checkOrderDeletable(orderId: string): Promise<{
  deletable: boolean;
  reason?: DeleteRefusal;
  message?: string;
}> {
  await requireAdmin();
  const res = await canDeleteOrder(orderId);
  if (res.ok) return { deletable: true };
  return { deletable: false, reason: res.reason, message: REASON_LABEL[res.reason] };
}

// Re-quote Melhor Envio for an order's current cart + destination. Used by
// the ShipServicePicker when an admin needs to pick (or override) the
// shipping service before buying a label. Does NOT write to DB — the UI
// displays the options and calls `setOrderShippingChoice` to persist.
export async function quoteOrderShipping(orderId: string): Promise<
  | {
      ok: true;
      options: Array<{
        serviceId: string;
        carrier: string;
        name: string;
        priceCents: number;
        etaDays: number;
      }>;
    }
  | { ok: false; reason: string }
> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      shippingAddress: true,
      items: { select: { variantId: true, qty: true } },
    },
  });
  if (!order) return { ok: false, reason: "order_not_found" };
  const addr = order.shippingAddress as { cep?: string };
  if (!addr.cep) return { ok: false, reason: "order_has_no_destination_cep" };

  const toCep = normalizeCep(addr.cep);
  if (toCep.length !== 8) return { ok: false, reason: "invalid_destination_cep" };

  try {
    const { options } = await quoteForVariants(
      toCep,
      order.items.map((it) => ({ variantId: it.variantId, qty: it.qty })),
    );
    return { ok: true, options };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 120) };
  }
}

// Persist a shipping service choice onto an Order. Writes a NOTE_ADDED
// OrderEvent describing the (re-)pick so the timeline captures it.
export async function setOrderShippingChoice(input: {
  orderId: string;
  serviceId: string;
  carrier: string;
  priceCents: number;
  etaDays: number;
}): Promise<void> {
  const admin = await requireAdmin();
  const before = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      shippingServiceId: true,
      shippingCarrier: true,
      shippingCents: true,
      subtotalCents: true,
      discountCents: true,
      number: true,
    },
  });
  if (!before) throw new Error("order_not_found");

  // Recompute total with the new freight — keep the invariant that
  // totalCents == subtotal + shipping - discount.
  const newTotal = Math.max(
    0,
    before.subtotalCents + input.priceCents - before.discountCents,
  );

  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      shippingServiceId: input.serviceId,
      shippingCarrier: input.carrier,
      shippingCents: input.priceCents,
      shippingEtaDays: input.etaDays,
      totalCents: newTotal,
    },
  });

  await recordOrderEvent(input.orderId, OrderEventType.NOTE_ADDED, {
    actor: `admin:${admin.user.id}`,
    message: before.shippingServiceId
      ? `Serviço de frete trocado de "${before.shippingCarrier ?? before.shippingServiceId}" (R$${(before.shippingCents / 100).toFixed(2)}) para "${input.carrier}" (R$${(input.priceCents / 100).toFixed(2)})`
      : `Serviço de frete definido: ${input.carrier} · ${input.serviceId} · R$${(input.priceCents / 100).toFixed(2)}`,
    metadata: {
      from: {
        serviceId: before.shippingServiceId,
        carrier: before.shippingCarrier,
        priceCents: before.shippingCents,
      },
      to: {
        serviceId: input.serviceId,
        carrier: input.carrier,
        priceCents: input.priceCents,
        etaDays: input.etaDays,
      },
    },
  });

  revalidatePath(`/admin/pedidos/${input.orderId}`);
  revalidatePath(`/admin/pedidos`);
}

// Admin "Comprar etiqueta" trigger. Manual-only per product decision —
// operators confirm packaging before we debit the Melhor Envio balance.
export async function purchaseShippingLabelAction(
  orderId: string,
): Promise<
  | { ok: true; shipmentId: string; labelUrl: string | null; trackingCode: string | null; reused: boolean }
  | { ok: false; reason: string }
> {
  const admin = await requireAdmin();
  const res = await purchaseShippingLabel(orderId, {
    actor: `admin:${admin.user.id}`,
  });
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath(`/admin/pedidos`);
  if (res.ok) {
    return {
      ok: true,
      shipmentId: res.shipmentId,
      labelUrl: res.labelUrl,
      trackingCode: res.trackingCode,
      reused: res.reused,
    };
  }
  return res;
}

// Admin "Reembolsar" trigger. Amount is in cents; omit for full remaining.
export async function refundPaymentAction(input: {
  orderId: string;
  paymentId?: string;
  amountCents?: number;
  reason: string;
}): Promise<
  | { ok: true; refundId: string; amountCents: number; fullyRefunded: boolean }
  | { ok: false; reason: string }
> {
  const admin = await requireAdmin();
  const res = await refundPayment({
    orderId: input.orderId,
    paymentId: input.paymentId,
    amountCents: input.amountCents,
    reason: input.reason,
    actor: `admin:${admin.user.id}`,
  });
  revalidatePath(`/admin/pedidos/${input.orderId}`);
  revalidatePath(`/admin/pedidos`);
  return res;
}

// Admin "Emitir NF-e" trigger. Same helper the MP webhook uses.
export async function issueInvoiceAction(
  orderId: string,
): Promise<{ ok: boolean; reason?: string; invoiceId?: string }> {
  const admin = await requireAdmin();
  const res = await issueInvoice(orderId, {
    actor: `admin:${admin.user.id}`,
    reason: "manual",
  });
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath(`/admin/pedidos`);
  return res.ok
    ? { ok: true, invoiceId: res.invoiceId }
    : { ok: false, reason: res.reason };
}

// Re-poll Tiny on-demand for an Invoice — useful when admin is watching a
// pending NF-e and doesn't want to wait for the 5-minute cron.
export async function reconcileInvoiceAction(invoiceId: string): Promise<void> {
  await requireAdmin();
  await reconcileInvoice(invoiceId);
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { orderId: true },
  });
  if (invoice) {
    revalidatePath(`/admin/pedidos/${invoice.orderId}`);
  }
  revalidatePath(`/admin/pedidos`);
}

export async function cancelInvoiceAction(
  invoiceId: string,
  reason: string,
): Promise<void> {
  const admin = await requireAdmin();
  if (reason.trim().length < 15) {
    throw new Error("Motivo precisa ter ao menos 15 caracteres");
  }
  await cancelInvoice(invoiceId, {
    actor: `admin:${admin.user.id}`,
    reason: reason.trim(),
  });
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { orderId: true },
  });
  if (invoice) {
    revalidatePath(`/admin/pedidos/${invoice.orderId}`);
  }
  revalidatePath(`/admin/pedidos`);
}

// Admin-triggered Tiny stock reconcile. Same semantics as the cron (full
// catalog, authoritative); tagged with source=ADMIN_MANUAL for the audit
// trail. Returns the outcome so the UI can surface counts inline.
export async function triggerTinyStockSync(opts?: { dryRun?: boolean }): Promise<{
  ok: boolean;
  summary: string;
  runId: string;
  outcome?: Outcome;
}> {
  await requireAdmin();
  const dryRun = Boolean(opts?.dryRun);
  const startedAt = Date.now();

  const run = await prisma.integrationRun.create({
    data: {
      adapter: "tiny",
      operation: dryRun ? "stock.reconcile.dry" : "stock.reconcile",
      status: "running",
      payload: { source: "ADMIN_MANUAL", startedAt: new Date(startedAt).toISOString() },
    },
  });

  try {
    const { snapshot, errors } = await buildFullCatalogSnapshot();
    if (errors.length > 0) {
      await prisma.integrationRun.update({
        where: { id: run.id },
        data: {
          status: "error",
          durationMs: Date.now() - startedAt,
          error: `Unable to reach Tiny for ${errors.length} SKUs`,
          payload: { errors: errors.slice(0, 20), errorCount: errors.length },
        },
      });
      revalidatePath("/admin/integrations");
      return {
        ok: false,
        summary: `Tiny inacessível para ${errors.length} SKUs`,
        runId: run.id,
      };
    }

    const outcome = await reconcileStockFromTiny({
      source: StockSyncSource.ADMIN_MANUAL,
      snapshot,
      authoritative: true,
      runId: run.id,
      dryRun,
    });

    const status =
      !outcome.ok
        ? outcome.reason === "safety_threshold"
          ? "aborted_safety"
          : "aborted"
        : dryRun
          ? "dry_ok"
          : "ok";

    await prisma.integrationRun.update({
      where: { id: run.id },
      data: {
        status,
        durationMs: Date.now() - startedAt,
        payload: outcomeAsPayload(outcome),
        error: !outcome.ok ? summarize(outcome) : null,
      },
    });
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/integrations/runs");
    return { ok: outcome.ok, summary: summarize(outcome), runId: run.id, outcome };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: msg.slice(0, 500),
      },
    });
    revalidatePath("/admin/integrations");
    return { ok: false, summary: msg, runId: run.id };
  }
}

export async function markOrderDelivered(orderId: string) {
  await requireAdmin();
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.DELIVERED },
    select: {
      id: true,
      number: true,
      customerId: true,
      items: { select: { variant: { select: { product: { select: { slug: true } } } } } },
      customer: { select: { email: true, name: true } },
    },
  });

  if (updated.customer?.email) {
    // Link to the first purchased product for review — easiest one-tap path.
    const firstSlug = updated.items[0]?.variant.product.slug;
    const reviewUrl = firstSlug
      ? absoluteUrl(`/loja/${firstSlug}#avaliacoes`)
      : absoluteUrl(`/minha-conta/pedidos/${orderId}`);
    await sendSafe({
      channel: NotificationChannel.EMAIL,
      template: "order_delivered",
      data: {
        customerName: updated.customer.name,
        orderNumber: updated.number,
        reviewUrl,
      },
      recipient: updated.customer.email,
      customerId: updated.customerId,
      orderId: updated.id,
    });
  }

  const adminId = (await requireAdmin()).user.id;
  await recordOrderEvent(updated.id, OrderEventType.DELIVERED, {
    actor: `admin:${adminId}`,
    message: "Pedido entregue",
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath(`/minha-conta/pedidos/${orderId}`);
}

// ---------- Settings actions (/admin/configuracoes) ----------

// Save a plain-JSON setting. Validated by the caller against the typed
// default in `lib/settings.ts`. Records a SettingChange row so the UI
// can show "quem mudou o quê" without leaking the previous value.
export async function saveSettingAction<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  const admin = await requireAdmin();
  await setSetting(key, value, `admin:${admin.user.id}`);
  await recordSettingChange({
    settingKey: key,
    changedBy: `admin:${admin.user.id}`,
    isSecret: false,
    diff: { keys: Object.keys(value ?? {}) },
  });
  revalidatePath("/admin/configuracoes");
}

// Save an encrypted secret. Write-only — the API never returns the stored
// plaintext to the client. Last-4 chars are cached for UI confirmation.
export async function saveSecretAction(
  key: SecretKey,
  plaintext: string,
): Promise<{ last4: string }> {
  const admin = await requireAdmin();
  if (!plaintext || plaintext.length < 4) {
    throw new Error("Segredo inválido");
  }
  await setSecret(key, plaintext, `admin:${admin.user.id}`);
  revalidatePath("/admin/configuracoes");
  return { last4: plaintext.slice(-4) };
}

export async function clearSecretAction(key: SecretKey): Promise<void> {
  const admin = await requireAdmin();
  await clearSecret(key, `admin:${admin.user.id}`);
  revalidatePath("/admin/configuracoes");
}

// Send a test transactional email using the currently-effective email
// configuration (DB settings with env fallback). Surface the error message
// from nodemailer / our adapter so the operator can debug misconfigs.
export async function testEmailAction(
  recipient: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, error: "E-mail inválido" };
  }
  if (!(await emailConfigured())) {
    return { ok: false, error: "SMTP ainda não configurado por completo" };
  }
  try {
    await sendEmail({
      to: recipient,
      subject: "Teste — Brilho de Diva",
      text: `Teste disparado via /admin/configuracoes por admin:${admin.user.id}.`,
      html: `<p>Teste de configuração SMTP enviado via <code>/admin/configuracoes</code>.</p><p><small>actor: admin:${admin.user.id}</small></p>`,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
    };
  }
}

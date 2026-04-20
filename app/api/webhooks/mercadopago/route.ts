import { NextResponse, type NextRequest } from "next/server";
import { mercadoPago, fetchMpPayment } from "@/lib/integration/mp/client";
import { publishOrderToErp } from "@/lib/integration/publish-order";
import { prisma } from "@/lib/db";
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  FunnelEventType,
  NotificationChannel,
  OrderEventType,
} from "@/lib/generated/prisma/enums";
import { sendSafe } from "@/lib/notifications/dispatch";
import { absoluteUrl } from "@/lib/notifications/templates/shared";
import { recordOrderEvent } from "@/lib/order-events";
import { issueInvoice } from "@/lib/invoices";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, PaymentStatus> = {
  pending: PaymentStatus.PENDING,
  in_process: PaymentStatus.IN_PROCESS,
  approved: PaymentStatus.APPROVED,
  rejected: PaymentStatus.REJECTED,
  cancelled: PaymentStatus.CANCELLED,
  refunded: PaymentStatus.REFUNDED,
  charged_back: PaymentStatus.CHARGED_BACK,
};

// Pull typed Payment columns out of MP's response. Everything we don't
// explicitly map stays in `rawPayload` for audit.
function extractPaymentFields(mp: Record<string, unknown>) {
  const toCents = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null;

  const paymentTypeId = typeof mp.payment_type_id === "string" ? mp.payment_type_id : null;
  const installments = typeof mp.installments === "number" ? mp.installments : null;

  const txDetails = (mp.transaction_details ?? {}) as Record<string, unknown>;
  const card = (mp.card ?? {}) as Record<string, unknown>;
  const cardholder = (card.cardholder ?? {}) as Record<string, unknown>;
  const poi = (mp.point_of_interaction ?? {}) as Record<string, unknown>;
  const txData = (poi.transaction_data ?? {}) as Record<string, unknown>;

  // Fee details is an array on MP; sum them up.
  let feeCents: number | null = null;
  if (Array.isArray(mp.fee_details)) {
    const sum = (mp.fee_details as Array<{ amount?: number }>).reduce(
      (a, f) => a + (typeof f.amount === "number" ? f.amount : 0),
      0,
    );
    feeCents = sum > 0 ? Math.round(sum * 100) : null;
  }

  // Map MP's granular type to our coarse enum for filtering.
  const method: PaymentMethod =
    paymentTypeId === "credit_card" || paymentTypeId === "debit_card"
      ? PaymentMethod.CARD
      : paymentTypeId === "ticket"
        ? PaymentMethod.BOLETO
        : paymentTypeId === "bank_transfer" || paymentTypeId === "account_money"
          ? PaymentMethod.PIX
          : PaymentMethod.CARD;

  const expiresAt =
    typeof mp.date_of_expiration === "string" ? new Date(mp.date_of_expiration) : null;

  return {
    method,
    paymentTypeId,
    installments,
    installmentAmountCents: toCents(txDetails.installment_amount),
    feeCents,
    netReceivedCents: toCents(txDetails.net_received_amount),
    refundedCents: toCents(mp.refunded_amount) ?? 0,
    refundedAt:
      toCents(mp.refunded_amount) && toCents(mp.refunded_amount)! > 0 && typeof mp.date_last_updated === "string"
        ? new Date(mp.date_last_updated)
        : null,
    cardLastFour:
      typeof card.last_four_digits === "string" ? card.last_four_digits : null,
    cardHolderName:
      typeof cardholder.name === "string" ? cardholder.name : null,
    pixQrCode:
      method === PaymentMethod.PIX && typeof txData.qr_code === "string"
        ? (txData.qr_code as string)
        : null,
    pixQrCodeBase64:
      method === PaymentMethod.PIX && typeof txData.qr_code_base64 === "string"
        ? (txData.qr_code_base64 as string)
        : null,
    pixExpiresAt: method === PaymentMethod.PIX ? expiresAt : null,
    boletoUrl:
      method === PaymentMethod.BOLETO && typeof txData.ticket_url === "string"
        ? (txData.ticket_url as string)
        : method === PaymentMethod.BOLETO && typeof txDetails.external_resource_url === "string"
          ? (txDetails.external_resource_url as string)
          : null,
    boletoBarcode:
      method === PaymentMethod.BOLETO && typeof txDetails.verification_code === "string"
        ? (txDetails.verification_code as string)
        : null,
    boletoExpiresAt: method === PaymentMethod.BOLETO ? expiresAt : null,
  };
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  // MP sends notifications in two formats:
  //   - Webhooks v1.0: `?data.id=...&type=payment` + x-signature header
  //   - Feed v2.0:     `?id=...&topic=payment|merchant_order`, NO signature
  // The v2.0 stream is redundant with v1.0 (same payment, older format).
  // Accept 200 on v2.0 so MP stops retrying; only verify + process v1.0.
  const topic = req.nextUrl.searchParams.get("topic");
  if (topic) {
    await prisma.integrationRun.create({
      data: {
        adapter: "mercadopago",
        operation: "webhook",
        status: "ignored_feed_v2",
        payload: { topic, id: req.nextUrl.searchParams.get("id") },
      },
    });
    return NextResponse.json({ ok: true, ignored: "feed_v2" });
  }

  // MP signs the manifest with `data.id` from the URL query string
  // (`?data.id=...`), not the JSON body — pass it through.
  const dataIdFromUrl =
    req.nextUrl.searchParams.get("data.id") ??
    req.nextUrl.searchParams.get("id") ??
    null;
  const ok = await mercadoPago.verifyWebhook(headers, raw, dataIdFromUrl);
  if (!ok) {
    await prisma.integrationRun.create({
      data: {
        adapter: "mercadopago",
        operation: "webhook",
        status: "rejected_signature",
        error: "signature mismatch",
        payload: {
          dataIdFromUrl,
          hasSignature: Boolean(headers["x-signature"] ?? headers["X-Signature"]),
          hasRequestId: Boolean(headers["x-request-id"] ?? headers["X-Request-Id"]),
        },
      },
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: { type?: string; data?: { id?: string | number } } = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const paymentId = payload.data?.id?.toString();
  if (payload.type !== "payment" || !paymentId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const mpPayment = await fetchMpPayment(paymentId);
  if (!mpPayment) return NextResponse.json({ ok: true, stub: true });

  const orderId = (mpPayment as Record<string, unknown>).external_reference as string | undefined;
  const status = ((mpPayment as Record<string, unknown>).status as string | undefined)?.toLowerCase();
  const mappedStatus = status ? STATUS_MAP[status] ?? PaymentStatus.PENDING : PaymentStatus.PENDING;

  if (!orderId) return NextResponse.json({ ok: true, ignored: true });

  const extracted = extractPaymentFields(mpPayment as Record<string, unknown>);
  const amountCents = Math.round(
    (((mpPayment as Record<string, unknown>).transaction_amount as number | undefined) ?? 0) * 100,
  );

  // Detect status transitions: compare with the prior Payment row if any.
  const prior = await prisma.payment.findUnique({
    where: { providerId: paymentId },
    select: { status: true, refundedCents: true },
  });

  await prisma.payment.upsert({
    where: { providerId: paymentId },
    create: {
      orderId,
      provider: "mercadopago",
      providerId: paymentId,
      status: mappedStatus,
      amountCents,
      rawPayload: mpPayment as object,
      ...extracted,
    },
    update: {
      status: mappedStatus,
      rawPayload: mpPayment as object,
      ...extracted,
    },
  });

  // Keep the Order denormalization cache fresh for the admin list.
  await prisma.order.update({
    where: { id: orderId },
    data: {
      lastPaymentMethod: extracted.method,
      lastPaymentStatus: mappedStatus,
    },
  });

  // Only emit an OrderEvent if status actually changed, so retries / MP's
  // "final" webhook after an already-approved payment don't spam the timeline.
  const statusChanged = !prior || prior.status !== mappedStatus;

  if (mappedStatus === PaymentStatus.APPROVED) {
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAID } });
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        number: true,
        totalCents: true,
        shippingAddress: true,
        customer: { select: { email: true, name: true } },
      },
    });
    await prisma.funnelEvent.create({
      data: {
        type: FunnelEventType.ORDER_PAID,
        sessionId: order?.customerId ? `customer:${order.customerId}` : `order:${orderId}`,
        customerId: order?.customerId ?? null,
        orderId,
      },
    });
    if (statusChanged) {
      await recordOrderEvent(orderId, OrderEventType.PAYMENT_APPROVED, {
        actor: "webhook:mp",
        message: `Pagamento aprovado · ${extracted.paymentTypeId ?? "desconhecido"}${
          extracted.installments && extracted.installments > 1 ? ` · ${extracted.installments}x` : ""
        }`,
        metadata: {
          paymentId,
          amountCents,
          netReceivedCents: extracted.netReceivedCents,
          feeCents: extracted.feeCents,
          installments: extracted.installments,
        },
      });
    }
    try {
      await publishOrderToErp(orderId);
    } catch (err) {
      console.error("publishOrderToErp failed", err);
    }

    // Auto-issue NF-e immediately after Tiny has the pedido. Gated by a
    // SettingsKv flag so the team can disable if Tiny emission is being
    // worked on manually. Failures here are non-fatal — the failure is
    // captured on the Invoice row + IntegrationRun for admin visibility.
    if (statusChanged) {
      try {
        const cfg = await getSetting("invoice.autoIssueOnPaid");
        if (cfg.enabled) {
          const res = await issueInvoice(orderId, { actor: "webhook:mp", reason: "auto" });
          if (!res.ok) {
            console.warn(`[mp-webhook] auto-issue skipped: ${res.reason}`);
          }
        }
      } catch (err) {
        console.error("auto-issue invoice failed", err);
      }
    }

    const addr = (order?.shippingAddress ?? {}) as { recipient?: string };
    const recipient = order?.customer?.email ?? null;
    if (order && recipient && statusChanged) {
      await sendSafe({
        channel: NotificationChannel.EMAIL,
        template: "payment_approved",
        data: {
          customerName: order.customer?.name ?? addr.recipient ?? null,
          orderNumber: order.number,
          totalCents: order.totalCents,
          orderUrl: absoluteUrl(`/minha-conta/pedidos/${orderId}`),
        },
        recipient,
        customerId: order.customerId,
        orderId,
      });
    }
  } else if (mappedStatus === PaymentStatus.REFUNDED) {
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.REFUNDED } });
    if (statusChanged) {
      await recordOrderEvent(orderId, OrderEventType.PAYMENT_REFUNDED, {
        actor: "webhook:mp",
        message: `Pagamento reembolsado${
          extracted.refundedCents > 0 ? ` · R$${(extracted.refundedCents / 100).toFixed(2)}` : ""
        }`,
        metadata: { paymentId, refundedCents: extracted.refundedCents },
      });

      // Notify the customer of externally-initiated refunds (MP dashboard,
      // chargebacks). The Notification unique constraint dedupes against
      // admin-initiated refunds that already fired the same template.
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          customerId: true,
          number: true,
          shippingAddress: true,
          customer: { select: { email: true, name: true } },
        },
      });
      const addr = (order?.shippingAddress ?? {}) as { recipient?: string };
      const recipient = order?.customer?.email ?? null;
      if (order && recipient) {
        await sendSafe({
          channel: NotificationChannel.EMAIL,
          template: "refund_issued",
          data: {
            customerName: order.customer?.name ?? addr.recipient ?? null,
            orderNumber: order.number,
            amountCents: extracted.refundedCents || amountCents,
            totalRefundedCents: extracted.refundedCents || amountCents,
            fullyRefunded: true,
            reason: "Reembolso processado pelo Mercado Pago",
            orderUrl: absoluteUrl(`/minha-conta/pedidos/${orderId}`),
          },
          recipient,
          customerId: order.customerId,
          orderId,
        });
      }
    }
  } else if (mappedStatus === PaymentStatus.CHARGED_BACK) {
    if (statusChanged) {
      await recordOrderEvent(orderId, OrderEventType.PAYMENT_CHARGED_BACK, {
        actor: "webhook:mp",
        message: "Chargeback recebido — disputa aberta",
        metadata: { paymentId, amountCents },
      });
    }
  } else if (mappedStatus === PaymentStatus.CANCELLED || mappedStatus === PaymentStatus.REJECTED) {
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        number: true,
        shippingAddress: true,
        customer: { select: { email: true, name: true } },
      },
    });
    if (statusChanged) {
      await recordOrderEvent(orderId, OrderEventType.PAYMENT_REJECTED, {
        actor: "webhook:mp",
        message:
          mappedStatus === PaymentStatus.REJECTED
            ? "Pagamento recusado"
            : "Pagamento cancelado",
        metadata: { paymentId, mpStatus: status },
      });
    }
    const addr = (order?.shippingAddress ?? {}) as { recipient?: string };
    const recipient = order?.customer?.email ?? null;
    if (order && recipient && statusChanged) {
      await sendSafe({
        channel: NotificationChannel.EMAIL,
        template: "payment_failed",
        data: {
          customerName: order.customer?.name ?? addr.recipient ?? null,
          orderNumber: order.number,
          retryUrl: absoluteUrl(`/checkout`),
        },
        recipient,
        customerId: order.customerId,
        orderId,
      });
    }
  } else if (mappedStatus === PaymentStatus.PENDING && statusChanged) {
    // Pix / Boleto in flight. Emit the "we're waiting" event.
    await recordOrderEvent(orderId, OrderEventType.PAYMENT_PENDING, {
      actor: "webhook:mp",
      message: `Aguardando pagamento · ${extracted.paymentTypeId ?? "desconhecido"}`,
      metadata: {
        paymentId,
        paymentTypeId: extracted.paymentTypeId,
        hasPixQr: Boolean(extracted.pixQrCode),
        hasBoletoUrl: Boolean(extracted.boletoUrl),
      },
    });

    // If we have a Pix QR, give the customer an email with the code and
    // a link back to the order. This is the single biggest recovery path —
    // customers who close the MP tab lose access to the QR otherwise.
    if (extracted.method === PaymentMethod.PIX && extracted.pixQrCode) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          customerId: true,
          number: true,
          totalCents: true,
          shippingAddress: true,
          customer: { select: { email: true, name: true } },
        },
      });
      const addr = (order?.shippingAddress ?? {}) as { recipient?: string };
      const recipient = order?.customer?.email ?? null;
      if (order && recipient) {
        await sendSafe({
          channel: NotificationChannel.EMAIL,
          template: "payment_pending_pix",
          data: {
            customerName: order.customer?.name ?? addr.recipient ?? null,
            orderNumber: order.number,
            totalCents: order.totalCents,
            pixQrCode: extracted.pixQrCode,
            pixQrCodeBase64: extracted.pixQrCodeBase64,
            pixExpiresAt: extracted.pixExpiresAt,
            orderUrl: absoluteUrl(`/minha-conta/pedidos/${orderId}`),
          },
          recipient,
          customerId: order.customerId,
          orderId,
        });
      }
    }
  }

  await prisma.integrationRun.create({
    data: {
      adapter: "mercadopago",
      operation: "webhook",
      status: mappedStatus,
      payload: { paymentId, orderId, status, method: extracted.method },
    },
  });

  return NextResponse.json({ ok: true });
}

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  OrderStatus,
  PaymentStatus,
  NotificationChannel,
  OrderEventType,
} from "@/lib/generated/prisma/enums";
import { refundMpPayment, fetchMpPayment } from "@/lib/integration/mp/client";
import { recordOrderEvent } from "@/lib/order-events";
import { sendSafe } from "@/lib/notifications/dispatch";
import { absoluteUrl } from "@/lib/notifications/templates/shared";

// Orchestrates a refund. Used by:
//   - admin "Reembolsar" button
//   - `./scripts/bdd refund` CLI
//
// MP's refund endpoint is idempotent at the refund-id level but not at the
// amount level — calling twice creates two refunds. Callers must prevent
// double-submit. We also re-fetch the Payment after refunding to pick up
// MP's authoritative `refunded_amount` sum.
export async function refundPayment(input: {
  orderId: string;
  paymentId?: string;              // our Payment.id; defaults to latest APPROVED
  amountCents?: number;            // omit for full remaining
  reason: string;
  actor: string;
}): Promise<
  | { ok: true; refundId: string; amountCents: number; fullyRefunded: boolean }
  | { ok: false; reason: string }
> {
  if (input.reason.trim().length < 10) return { ok: false, reason: "reason_too_short" };

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      payments: { orderBy: { createdAt: "desc" } },
      customer: { select: { id: true, email: true, name: true } },
    },
  });
  if (!order) return { ok: false, reason: "order_not_found" };

  const payment = input.paymentId
    ? order.payments.find((p) => p.id === input.paymentId)
    : order.payments.find((p) => p.status === PaymentStatus.APPROVED);
  if (!payment) return { ok: false, reason: "no_refundable_payment" };
  if (!payment.providerId) return { ok: false, reason: "payment_has_no_provider_id" };

  const remaining = payment.amountCents - payment.refundedCents;
  if (remaining <= 0) return { ok: false, reason: "fully_refunded_already" };

  const requested = input.amountCents ?? remaining;
  if (requested <= 0 || requested > remaining) {
    return { ok: false, reason: "invalid_amount" };
  }

  let refund: Awaited<ReturnType<typeof refundMpPayment>>;
  try {
    refund = await refundMpPayment({
      paymentId: payment.providerId,
      amountCents: requested === payment.amountCents ? undefined : requested,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.create({
      data: {
        adapter: "mercadopago",
        operation: "refund",
        status: "error",
        error: msg.slice(0, 500),
        payload: { orderId: input.orderId, paymentId: payment.id, amountCents: requested },
      },
    });
    return { ok: false, reason: "mp_error" };
  }

  // Pull authoritative totals from MP. `refunded_amount` is cumulative
  // across all refunds on the payment — exactly what we store.
  const refreshed = (await fetchMpPayment(payment.providerId)) as
    | Record<string, unknown>
    | null;
  const refreshedRefundedCents =
    refreshed && typeof refreshed.refunded_amount === "number"
      ? Math.round(refreshed.refunded_amount * 100)
      : payment.refundedCents + refund.amountCents;
  const refreshedStatus = (refreshed?.status as string | undefined)?.toLowerCase();
  const fullyRefunded =
    refreshedStatus === "refunded" || refreshedRefundedCents >= payment.amountCents;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundedCents: refreshedRefundedCents,
      refundedAt: new Date(),
      status: fullyRefunded ? PaymentStatus.REFUNDED : payment.status,
      rawPayload: (refreshed ?? payment.rawPayload) as Prisma.InputJsonValue,
    },
  });

  if (fullyRefunded) {
    await prisma.order.update({
      where: { id: input.orderId },
      data: { status: OrderStatus.REFUNDED, lastPaymentStatus: PaymentStatus.REFUNDED },
    });
  }

  await recordOrderEvent(input.orderId, OrderEventType.PAYMENT_REFUNDED, {
    actor: input.actor,
    message: fullyRefunded
      ? `Reembolso total · R$${(refund.amountCents / 100).toFixed(2)} · ${input.reason}`
      : `Reembolso parcial · R$${(refund.amountCents / 100).toFixed(2)} · ${input.reason}`,
    metadata: {
      refundId: refund.refundId,
      paymentId: payment.id,
      amountCents: refund.amountCents,
      totalRefundedCents: refreshedRefundedCents,
      fullyRefunded,
      reason: input.reason,
    },
  });

  await prisma.integrationRun.create({
    data: {
      adapter: "mercadopago",
      operation: "refund",
      status: "ok",
      payload: {
        orderId: input.orderId,
        paymentId: payment.id,
        mpRefundId: refund.refundId,
        amountCents: refund.amountCents,
        totalRefundedCents: refreshedRefundedCents,
        actor: input.actor,
        reason: input.reason,
      },
    },
  });

  // Customer email — fire-and-forget. Unique constraint
  // (orderId, template, channel) ensures we only send once per order, which
  // is the right UX (customer doesn't need a play-by-play for partials on
  // a boutique-sized catalog).
  if (order.customer?.email) {
    await sendSafe({
      channel: NotificationChannel.EMAIL,
      template: "refund_issued",
      data: {
        customerName: order.customer.name,
        orderNumber: order.number,
        amountCents: refund.amountCents,
        totalRefundedCents: refreshedRefundedCents,
        fullyRefunded,
        reason: input.reason,
        orderUrl: absoluteUrl(`/minha-conta/pedidos/${input.orderId}`),
      },
      recipient: order.customer.email,
      customerId: order.customerId,
      orderId: input.orderId,
    });
  }

  return { ok: true, refundId: refund.refundId, amountCents: refund.amountCents, fullyRefunded };
}

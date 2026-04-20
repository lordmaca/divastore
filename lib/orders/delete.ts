import { prisma } from "@/lib/db";
import {
  InvoiceStatus,
  PaymentStatus,
  ShipmentStatus,
  OrderStatus,
  OrderEventType,
} from "@/lib/generated/prisma/enums";
import { recordOrderEvent } from "@/lib/order-events";

// Reason codes surfaced to the admin UI. Keep these stable — they're
// rendered as pt-BR strings via REASON_LABEL below.
export type DeleteRefusal =
  | "order_not_found"
  | "already_deleted"
  | "has_active_invoice"
  | "shipment_in_flight"
  | "unrefunded_payment"
  | "reason_too_short";

export const REASON_LABEL: Record<DeleteRefusal, string> = {
  order_not_found: "Pedido não encontrado.",
  already_deleted: "Este pedido já foi excluído.",
  has_active_invoice:
    "Há uma NF-e ativa (solicitada ou emitida) para este pedido. Cancele a nota antes de excluir.",
  shipment_in_flight:
    "A etiqueta já foi postada ou o pedido já foi entregue. Não é possível excluir.",
  unrefunded_payment:
    "Existe pagamento aprovado sem reembolso completo. Processe o reembolso antes de excluir.",
  reason_too_short: "Informe um motivo com ao menos 10 caracteres.",
};

// Evaluates whether an order can be safely soft-deleted. Refuses when the
// deletion would break fiscal or payment integrity. Pure check — does not
// write. Called by both the admin action and the UI (to disable the button
// with a friendly message).
export async function canDeleteOrder(
  orderId: string,
): Promise<{ ok: true } | { ok: false; reason: DeleteRefusal }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      invoices: { select: { status: true } },
      payments: { select: { status: true, amountCents: true, refundedCents: true } },
      shipments: { select: { status: true } },
    },
  });
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.deletedAt) return { ok: false, reason: "already_deleted" };

  if (
    order.invoices.some(
      (i) => i.status === InvoiceStatus.ISSUED || i.status === InvoiceStatus.REQUESTED,
    )
  ) {
    return { ok: false, reason: "has_active_invoice" };
  }

  const blockingShipStatuses = new Set<ShipmentStatus>([
    ShipmentStatus.POSTED,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
  ]);
  if (order.shipments.some((s) => blockingShipStatuses.has(s.status))) {
    return { ok: false, reason: "shipment_in_flight" };
  }

  if (
    order.payments.some(
      (p) => p.status === PaymentStatus.APPROVED && p.refundedCents < p.amountCents,
    )
  ) {
    return { ok: false, reason: "unrefunded_payment" };
  }

  return { ok: true };
}

export async function softDeleteOrder(input: {
  orderId: string;
  reason: string;
  actor: string;
}): Promise<{ ok: true } | { ok: false; reason: DeleteRefusal }> {
  const trimmed = input.reason.trim();
  if (trimmed.length < 10) return { ok: false, reason: "reason_too_short" };

  const gate = await canDeleteOrder(input.orderId);
  if (!gate.ok) return gate;

  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      deletedAt: new Date(),
      deletedBy: input.actor,
      deletionReason: trimmed,
      status: OrderStatus.CANCELLED,
    },
  });

  await recordOrderEvent(input.orderId, OrderEventType.CANCELLED, {
    actor: input.actor,
    message: `Pedido excluído por admin — motivo: ${trimmed}`,
    metadata: { deletion: true, reason: trimmed },
  });

  return { ok: true };
}

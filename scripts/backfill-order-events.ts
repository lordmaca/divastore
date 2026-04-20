// One-shot script: synthesize OrderEvent rows for orders that pre-date the
// event-emitting code. Idempotent — skips any order that already has events.
//
// Run once after deploying Phase 1 of the orders overhaul:
//   ./scripts/bdd backfill-events

import { prisma } from "../lib/db";
import { OrderEventType, OrderStatus, PaymentStatus } from "../lib/generated/prisma/enums";

async function main() {
  const orders = await prisma.order.findMany({
    include: {
      payments: { orderBy: { createdAt: "asc" } },
      events: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let skipped = 0;
  for (const o of orders) {
    if (o.events.length > 0) {
      skipped++;
      continue;
    }

    const rows: Array<{
      type: OrderEventType;
      createdAt: Date;
      message: string;
      metadata?: Record<string, unknown>;
    }> = [];

    rows.push({
      type: OrderEventType.ORDER_CREATED,
      createdAt: o.createdAt,
      message: `Pedido #${o.number} criado (backfill)`,
      metadata: { totalCents: o.totalCents },
    });

    // Infer payment events from Payment rows.
    for (const p of o.payments) {
      if (p.status === PaymentStatus.APPROVED) {
        rows.push({
          type: OrderEventType.PAYMENT_APPROVED,
          createdAt: p.updatedAt,
          message: `Pagamento aprovado (backfill) · ${p.paymentTypeId ?? p.method}`,
          metadata: { paymentId: p.providerId, amountCents: p.amountCents },
        });
      } else if (p.status === PaymentStatus.REFUNDED) {
        rows.push({
          type: OrderEventType.PAYMENT_REFUNDED,
          createdAt: p.updatedAt,
          message: "Pagamento reembolsado (backfill)",
          metadata: { paymentId: p.providerId, refundedCents: p.refundedCents },
        });
      } else if (
        p.status === PaymentStatus.REJECTED ||
        p.status === PaymentStatus.CANCELLED
      ) {
        rows.push({
          type: OrderEventType.PAYMENT_REJECTED,
          createdAt: p.updatedAt,
          message: "Pagamento recusado/cancelado (backfill)",
          metadata: { paymentId: p.providerId },
        });
      } else if (p.status === PaymentStatus.CHARGED_BACK) {
        rows.push({
          type: OrderEventType.PAYMENT_CHARGED_BACK,
          createdAt: p.updatedAt,
          message: "Chargeback recebido (backfill)",
          metadata: { paymentId: p.providerId },
        });
      }
    }

    if (o.status === OrderStatus.SHIPPED || o.status === OrderStatus.DELIVERED) {
      rows.push({
        type: OrderEventType.SHIPPED,
        createdAt: o.updatedAt,
        message: o.trackingCode
          ? `Pedido enviado (backfill) · ${o.trackingCode}`
          : "Pedido enviado (backfill)",
        metadata: { trackingCode: o.trackingCode, carrier: o.shippingCarrier },
      });
    }
    if (o.status === OrderStatus.DELIVERED) {
      rows.push({
        type: OrderEventType.DELIVERED,
        createdAt: o.updatedAt,
        message: "Pedido entregue (backfill)",
      });
    }
    if (o.status === OrderStatus.CANCELLED) {
      rows.push({
        type: OrderEventType.CANCELLED,
        createdAt: o.updatedAt,
        message: "Pedido cancelado (backfill)",
      });
    }

    await prisma.orderEvent.createMany({
      data: rows.map((r) => ({
        orderId: o.id,
        type: r.type,
        actor: "backfill",
        message: r.message,
        metadata: r.metadata ? JSON.parse(JSON.stringify(r.metadata)) : undefined,
        createdAt: r.createdAt,
      })),
    });
    created += rows.length;
  }

  console.log(`[backfill-events] orders scanned=${orders.length} events created=${created} skipped (already has events)=${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-events] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

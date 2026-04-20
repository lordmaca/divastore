import { prisma } from "@/lib/db";
import { tiny } from "./tiny/provider";
import type { OrderPayload } from "./types";
import { OrderStatus } from "@/lib/generated/prisma/enums";

// Publish a paid order to the ERP. Idempotent on Order.tinyOrderId.
// Safe to call from webhooks, server actions, or admin retry buttons.
export async function publishOrderToErp(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.tinyOrderId) {
    return { skipped: true as const, externalId: order.tinyOrderId };
  }
  if (order.status !== OrderStatus.PAID) {
    throw new Error(`Order ${orderId} not in PAID status (current: ${order.status})`);
  }

  const addr = order.shippingAddress as Record<string, string>;
  const payload: OrderPayload = {
    storefrontOrderId: order.id,
    number: order.number,
    customer: {
      name: order.customer?.name ?? addr.recipient ?? "Cliente",
      email: order.customer?.email ?? "cliente@brilhodediva.com.br",
      phone: order.customer?.phone ?? undefined,
      cpf: order.customer?.cpf ?? undefined,
    },
    shippingAddress: {
      cep: addr.cep,
      street: addr.street,
      number: addr.number,
      complement: addr.complement,
      district: addr.district,
      city: addr.city,
      state: addr.state,
      country: addr.country ?? "BR",
    },
    items: order.items.map((it) => ({
      sku: it.sku,
      qty: it.qty,
      unitPriceCents: it.unitPriceCents,
      nameSnapshot: it.nameSnapshot,
    })),
    totalCents: order.totalCents,
    shippingCents: order.shippingCents,
    discountCents: order.discountCents,
    paidAt: order.updatedAt,
  };

  const { externalId } = await tiny.publishOrder(payload);
  await prisma.order.update({
    where: { id: order.id },
    data: { tinyOrderId: externalId },
  });
  return { skipped: false as const, externalId };
}

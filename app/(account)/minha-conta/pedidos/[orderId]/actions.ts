"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
} from "@/lib/generated/prisma/enums";
import { mercadoPago } from "@/lib/integration/mp/client";

// Allows the customer to (re)start payment for an order that's still
// awaiting payment — typical cases: the first preference failed to create,
// the customer closed the MP tab, or the preference expired. We generate a
// fresh preference with the same external_reference and redirect to it;
// any already-existing Payment row for this order stays as-is (webhook
// resolves by providerId, not by "latest preference").

export async function payOrderWithMp(formData: FormData) {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string") throw new Error("orderId ausente");

  const session = await auth();
  if (!session?.user) redirect(`/login?next=/minha-conta/pedidos/${orderId}`);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { email: true, name: true, phone: true } },
    },
  });
  if (!order) redirect("/minha-conta/pedidos");
  if (order.customerId !== session.user.id) redirect("/minha-conta/pedidos");

  const payable =
    order.status === OrderStatus.PENDING ||
    order.status === OrderStatus.AWAITING_PAYMENT;
  if (!payable) redirect(`/minha-conta/pedidos/${orderId}`);

  const addr = (order.shippingAddress ?? {}) as Record<string, string>;

  const pref = await mercadoPago.createPreference({
    orderId: order.id,
    items: order.items.map((it) => ({
      title: it.nameSnapshot,
      quantity: it.qty,
      unitPriceCents: it.unitPriceCents,
    })),
    payer: {
      email: order.customer?.email ?? "",
      name: order.customer?.name ?? addr.recipient ?? "",
      phone: order.customer?.phone ?? undefined,
    },
    shippingCostCents: order.shippingCents,
  });

  // Record a fresh Payment row for this preference if none exists yet;
  // otherwise just update the providerId so the webhook can reconcile.
  const existing = await prisma.payment.findFirst({
    where: { orderId: order.id, status: PaymentStatus.PENDING },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await prisma.payment.update({
      where: { id: existing.id },
      data: { providerId: pref.preferenceId },
    });
  } else {
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "mercadopago",
        providerId: pref.preferenceId,
        method: order.lastPaymentMethod ?? PaymentMethod.PIX,
        status: PaymentStatus.PENDING,
        amountCents: order.totalCents,
      },
    });
  }

  redirect(pref.initPoint);
}

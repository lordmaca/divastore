"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  FunnelEventType,
  NotificationChannel,
} from "@/lib/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureCartWritable, cartTotals } from "@/lib/cart";
import { mercadoPago } from "@/lib/integration/mp/client";
import { evaluateCoupon, incrementCouponUsage } from "@/lib/coupons";
import { trackServerEvent } from "@/lib/track";
import { quoteForVariants } from "@/lib/shipping";
import { normalizeCep } from "@/lib/address";
import { sendSafe } from "@/lib/notifications/dispatch";
import { absoluteUrl } from "@/lib/notifications/templates/shared";
import { recordOrderEvent } from "@/lib/order-events";
import { isValidCpf, sanitizeCpf } from "@/lib/cpf";
import { cookies } from "next/headers";
import { OrderEventType } from "@/lib/generated/prisma/enums";

const addressSchema = z.object({
  recipient: z.string().min(2).max(120),
  cep: z.string().min(8),
  street: z.string().min(2).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional().default(""),
  district: z.string().min(2).max(100),
  city: z.string().min(2).max(100),
  state: z.string().length(2),
});

const guestSchema = z.object({
  email: z.string().email().max(254),
  phone: z.string().min(10).max(20).optional().default(""),
});

const paymentSchema = z.object({
  paymentMethod: z.enum(["PIX", "CARD", "BOLETO"]),
});

// Shipping option passed back from the client after a successful /api/shipping/quote.
// We re-quote on the server to prevent tampering with serviceId/price.
const shippingSchema = z
  .object({
    serviceId: z.string().min(1).max(80),
  })
  .optional();

const couponField = z.string().max(80).optional().default("");
const optInField = z.coerce.boolean().optional().default(false);

const MP_PREFERRED: Record<"PIX" | "CARD" | "BOLETO", "pix" | "credit_card" | "bolbradesco"> = {
  PIX: "pix",
  CARD: "credit_card",
  BOLETO: "bolbradesco",
};

export async function placeOrder(formData: FormData) {
  const session = await auth();

  const parsedAddress = addressSchema.safeParse({
    recipient: formData.get("recipient"),
    cep: formData.get("cep"),
    street: formData.get("street"),
    number: formData.get("number"),
    complement: formData.get("complement") ?? "",
    district: formData.get("district"),
    city: formData.get("city"),
    state: formData.get("state"),
  });
  if (!parsedAddress.success) redirect("/checkout?error=invalid");

  // CPF is required on every checkout — needed for NF-e + Melhor Envio
  // label. If the logged-in customer already has one on file, we accept
  // either the stored value or a new one submitted via the form.
  const cpfRaw = (formData.get("cpf") as string | null) ?? "";
  const cpfDigits = sanitizeCpf(cpfRaw);
  let needsCpf = true;
  if (!cpfDigits && session?.user?.id) {
    const existing = await prisma.customer.findUnique({
      where: { id: session.user.id },
      select: { cpf: true },
    });
    needsCpf = !existing?.cpf;
  }
  if (needsCpf && !isValidCpf(cpfDigits)) redirect("/checkout?error=invalid_cpf");

  const parsedPayment = paymentSchema.safeParse({
    paymentMethod: formData.get("paymentMethod"),
  });
  if (!parsedPayment.success) redirect("/checkout?error=invalid_payment");

  const parsedShipping = shippingSchema.safeParse(
    formData.get("shippingServiceId")
      ? { serviceId: formData.get("shippingServiceId") }
      : undefined,
  );
  if (!parsedShipping.success) redirect("/checkout?error=invalid_shipping");

  const couponRaw = couponField.safeParse(formData.get("coupon") ?? "").data ?? "";
  const marketingOptIn = optInField.safeParse(formData.get("marketingOptIn") === "on").data ?? false;
  const whatsappOptIn = optInField.safeParse(formData.get("whatsappOptIn") === "on").data ?? false;

  // Resolve the customer: logged-in user OR guest (by email). Guest accounts
  // can later "claim" themselves via the password-reset flow to set a password.
  let customerId = session?.user?.id ?? null;
  let customerEmail: string;
  let customerName = parsedAddress.data.recipient;
  let customerPhone: string | undefined;

  if (!customerId) {
    const parsedGuest = guestSchema.safeParse({
      email: (formData.get("email") as string | null)?.toLowerCase().trim(),
      phone: ((formData.get("phone") as string | null) ?? "").trim(),
    });
    if (!parsedGuest.success) redirect("/checkout?error=invalid_email");

    const existing = await prisma.customer.findUnique({
      where: { email: parsedGuest.data.email },
      select: { id: true, passwordHash: true },
    });
    if (existing?.passwordHash) {
      // Email belongs to a registered account — ask them to log in so their
      // past orders stay linked, instead of silently cross-attributing.
      redirect(`/login?next=/checkout&error=existing`);
    }
    if (existing) {
      try {
        await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: parsedAddress.data.recipient,
            phone: parsedGuest.data.phone || undefined,
            cpf: cpfDigits,
            marketingOptIn,
            marketingOptInAt: marketingOptIn ? new Date() : null,
            whatsappOptIn,
            whatsappOptInAt: whatsappOptIn ? new Date() : null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          redirect("/checkout?error=cpf_conflict");
        }
        throw err;
      }
      customerId = existing.id;
    } else {
      try {
        const created = await prisma.customer.create({
          data: {
            email: parsedGuest.data.email,
            name: parsedAddress.data.recipient,
            phone: parsedGuest.data.phone || undefined,
            cpf: cpfDigits,
            guest: true,
            marketingOptIn,
            marketingOptInAt: marketingOptIn ? new Date() : null,
            whatsappOptIn,
            whatsappOptInAt: whatsappOptIn ? new Date() : null,
          },
          select: { id: true },
        });
        customerId = created.id;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          redirect("/checkout?error=cpf_conflict");
        }
        throw err;
      }
    }
    customerEmail = parsedGuest.data.email;
    customerPhone = parsedGuest.data.phone || undefined;
  } else {
    const u = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, name: true, phone: true, cpf: true },
    });
    customerEmail = u?.email ?? "cliente@brilhodediva.com.br";
    customerName = u?.name ?? parsedAddress.data.recipient;
    customerPhone = u?.phone ?? undefined;
    // Persist a newly-typed CPF + opt-ins on the existing customer record.
    const needsUpdate =
      marketingOptIn || whatsappOptIn || (cpfDigits && cpfDigits !== (u?.cpf ?? ""));
    if (needsUpdate) {
      try {
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            ...(cpfDigits && cpfDigits !== (u?.cpf ?? "") ? { cpf: cpfDigits } : {}),
            ...(marketingOptIn ? { marketingOptIn: true, marketingOptInAt: new Date() } : {}),
            ...(whatsappOptIn ? { whatsappOptIn: true, whatsappOptInAt: new Date() } : {}),
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          redirect("/checkout?error=cpf_conflict");
        }
        throw err;
      }
    }
  }

  if (!(await mercadoPago.isEnabled())) redirect("/checkout?error=payments_unavailable");

  // Cart (guest or logged — ensureCartWritable uses cookie fallback when no session).
  const cart = await ensureCartWritable();
  const { subtotalCents, itemCount } = cartTotals(cart);
  if (itemCount === 0) redirect("/carrinho");

  // Re-quote shipping server-side so a tampered serviceId can't shave cost.
  let shippingCents = 0;
  let shippingCarrier: string | null = null;
  let shippingServiceId: string | null = null;
  let shippingEtaDays: number | null = null;
  const toCep = normalizeCep(parsedAddress.data.cep);
  if (toCep.length === 8 && parsedShipping.data?.serviceId) {
    try {
      const { options } = await quoteForVariants(
        toCep,
        cart.items.map((it) => ({ variantId: it.variantId, qty: it.qty })),
      );
      const match = options.find((o) => o.serviceId === parsedShipping.data?.serviceId);
      if (match) {
        shippingCents = match.priceCents;
        shippingCarrier = match.carrier;
        shippingServiceId = match.serviceId;
        shippingEtaDays = match.etaDays;
      }
    } catch (err) {
      console.error("shipping re-quote failed", err);
    }
  }

  let appliedCouponCode: string | null = null;
  let discountCents = 0;
  if (couponRaw.trim()) {
    const evaluated = await evaluateCoupon(couponRaw, subtotalCents);
    if (!evaluated.ok) {
      redirect(
        `/checkout?coupon=${encodeURIComponent(couponRaw)}&couponError=${encodeURIComponent(evaluated.reason)}`,
      );
    }
    appliedCouponCode = evaluated.code;
    discountCents = evaluated.discountCents;
  }

  const totalCents = Math.max(0, subtotalCents + shippingCents - discountCents);

  // Read DM deep-link attribution (set by /api/cart/deep-link when the
  // customer arrived via a Divinha cart link). Consumed once: we clear
  // the cookie so follow-up orders don't inherit the wrong attribution.
  let attribution: Prisma.InputJsonValue | undefined;
  try {
    const jar = await cookies();
    const raw = jar.get("dh_cart_ref")?.value;
    if (raw) {
      const parsed = JSON.parse(raw) as { cartRef?: string; utmSource?: string };
      if (parsed.cartRef) {
        attribution = {
          source: parsed.utmSource ?? "divahub_dm",
          cartRef: parsed.cartRef,
          capturedAt: new Date().toISOString(),
        };
      }
      jar.delete("dh_cart_ref");
    }
  } catch {
    // Malformed cookie — ignore, no attribution.
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        customerId,
        status: OrderStatus.AWAITING_PAYMENT,
        subtotalCents,
        shippingCents,
        discountCents,
        couponCode: appliedCouponCode,
        totalCents,
        shippingAddress: {
          ...parsedAddress.data,
          country: "BR",
        } as unknown as Prisma.InputJsonValue,
        attribution,
        shippingCarrier,
        shippingServiceId,
        shippingEtaDays,
        items: {
          create: cart.items.map((it) => ({
            variantId: it.variantId,
            sku: it.variant.sku,
            nameSnapshot: `${it.variant.product.name}${it.variant.name ? " — " + it.variant.name : ""}`,
            unitPriceCents: it.variant.priceCents,
            qty: it.qty,
            totalCents: it.qty * it.variant.priceCents,
          })),
        },
      },
      include: { items: true },
    });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return created;
  });

  if (appliedCouponCode) {
    await incrementCouponUsage(appliedCouponCode);
  }

  // Save the address in the customer's book (first time) so future checkouts
  // can pre-fill. Skip if it's already there — match by (CEP, number, recipient).
  if (customerId) {
    const addr = parsedAddress.data;
    const cepDigits = addr.cep.replace(/\D/g, "");
    const existingAddr = await prisma.address.findFirst({
      where: {
        customerId,
        cep: cepDigits,
        number: addr.number,
        recipient: addr.recipient,
      },
      select: { id: true },
    });
    if (!existingAddr) {
      const count = await prisma.address.count({ where: { customerId } });
      await prisma.address.create({
        data: {
          customerId,
          recipient: addr.recipient,
          cep: cepDigits,
          street: addr.street,
          number: addr.number,
          complement: addr.complement || null,
          district: addr.district,
          city: addr.city,
          state: addr.state.toUpperCase(),
          isDefault: count === 0,
        },
      });
    }
  }

  await trackServerEvent({
    type: FunnelEventType.ORDER_CREATED,
    orderId: order.id,
    customerIdOverride: customerId ?? undefined,
  });

  const method = parsedPayment.data.paymentMethod;
  const pref = await mercadoPago.createPreference({
    orderId: order.id,
    items: order.items.map((it) => ({
      title: it.nameSnapshot,
      quantity: it.qty,
      unitPriceCents: it.unitPriceCents,
    })),
    payer: {
      email: customerEmail,
      name: customerName,
      phone: customerPhone,
    },
    shippingCostCents: shippingCents,
    preferredPaymentMethod: MP_PREFERRED[method],
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "mercadopago",
      providerId: pref.preferenceId,
      method: PaymentMethod[method],
      status: PaymentStatus.PENDING,
      amountCents: order.totalCents,
    },
  });

  // Mirror the intended method onto Order so the admin list can filter
  // without a JOIN. Webhook reconciles this once payment actually resolves.
  await prisma.order.update({
    where: { id: order.id },
    data: {
      lastPaymentMethod: PaymentMethod[method],
      lastPaymentStatus: PaymentStatus.PENDING,
    },
  });

  await recordOrderEvent(order.id, OrderEventType.ORDER_CREATED, {
    actor: customerId ? `customer:${customerId}` : "customer",
    message: `Pedido #${order.number} criado · ${method} · total R$${(order.totalCents / 100).toFixed(2)}`,
    metadata: {
      paymentMethod: method,
      subtotalCents,
      shippingCents,
      discountCents,
      totalCents,
      couponCode: appliedCouponCode,
      shippingServiceId,
      shippingCarrier,
      guest: !session?.user?.id,
    },
  });

  // Customer confirmation email — "recebemos seu pedido, aguardando pagamento".
  await sendSafe({
    channel: NotificationChannel.EMAIL,
    template: "order_created",
    data: {
      customerName,
      orderNumber: order.number,
      totalCents: order.totalCents,
      items: order.items.map((it) => ({
        name: it.nameSnapshot,
        qty: it.qty,
        totalCents: it.totalCents,
      })),
    },
    recipient: customerEmail,
    customerId,
    orderId: order.id,
  });

  // Safety net: if the checkout was guest, bake orderId into the redirect
  // so the success page can resolve the order without a session cookie.
  if (!session?.user?.id) {
    redirect(`${pref.initPoint}`);
  }
  redirect(pref.initPoint);
}

// Used by the success page to offer guests a "claim your account" CTA.
export async function ensureGuestResetLink(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customer: { select: { id: true, guest: true, passwordHash: true } },
    },
  });
  const c = order?.customer;
  if (!c || !c.guest || c.passwordHash) return null;
  return absoluteUrl(`/recuperar-senha`);
}

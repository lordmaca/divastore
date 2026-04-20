import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  OrderEventType,
  OrderStatus,
  ShipmentStatus,
  NotificationChannel,
} from "@/lib/generated/prisma/enums";
import { recordOrderEvent } from "@/lib/order-events";
import {
  meAddToCart,
  meCheckout,
  meGenerate,
  mePrintUrl,
  meTracking,
  meDefaultTrackingUrl,
} from "@/lib/integration/shipping/melhorenvio/labels";
import { getSetting } from "@/lib/settings";
import { sendSafe } from "@/lib/notifications/dispatch";
import { absoluteUrl } from "@/lib/notifications/templates/shared";

// Parses the JSON body out of a "ME 422 on /me/cart: {...}" error string
// and returns the human-readable "error" field. Falls back to the raw msg.
function extractMeDetail(raw: string): string {
  const start = raw.indexOf("{");
  if (start >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as {
        error?: string;
        message?: string;
      };
      const detail = parsed.error || parsed.message;
      if (detail) return detail;
    } catch {
      // fall through to raw
    }
  }
  return raw.slice(0, 200);
}

// Orchestrates buying a Melhor Envio label for an order. Called from the
// admin "Comprar etiqueta" action and the `bdd label` CLI. Idempotent —
// if there's already a non-CANCELLED Shipment for the order, returns it
// instead of double-buying.
export async function purchaseShippingLabel(
  orderId: string,
  opts: { actor: string } = { actor: "system" },
): Promise<
  | { ok: true; shipmentId: string; providerShipmentId: string; labelUrl: string | null; trackingCode: string | null; reused: boolean }
  | { ok: false; reason: string }
> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { name: true, email: true, phone: true, cpf: true } },
      items: true,
      shipments: { orderBy: { createdAt: "desc" } },
      invoices: {
        where: { status: "ISSUED" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PACKED) {
    return { ok: false, reason: "order_not_shippable" };
  }
  if (!order.shippingServiceId) {
    return { ok: false, reason: "no_shipping_service_selected" };
  }

  const active = order.shipments.find(
    (s) => s.status !== ShipmentStatus.CANCELLED,
  );
  if (active) {
    return {
      ok: true,
      shipmentId: active.id,
      providerShipmentId: active.providerShipmentId ?? "",
      labelUrl: active.labelUrl,
      trackingCode: active.trackingCode,
      reused: true,
    };
  }

  const origin = await getSetting("shipping.origin");
  if (!origin.cep || !origin.street) {
    return { ok: false, reason: "origin_address_missing" };
  }

  // Melhor Envio rejects the cart when the destinatário has no CNPJ/CPF.
  // Fail fast with an actionable reason so the admin knows exactly what to
  // ask the customer for, instead of a generic 422.
  const customerCpf = order.customer?.cpf?.replace(/\D/g, "") ?? "";
  if (!customerCpf) {
    return { ok: false, reason: "customer_cpf_missing" };
  }

  const defaultPkg = await getSetting("shipping.defaultPackage");

  const addr = order.shippingAddress as Record<string, string>;

  // Sum catalog dims for volumes; fall back to defaults when variants miss.
  const variants = await prisma.variant.findMany({
    where: { id: { in: order.items.map((i) => i.variantId) } },
    select: {
      id: true,
      widthCm: true,
      heightCm: true,
      lengthCm: true,
      weightG: true,
      priceCents: true,
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const volumes = order.items.map((it) => {
    const v = byId.get(it.variantId);
    return {
      height: v?.heightCm ?? defaultPkg.heightCm,
      width: v?.widthCm ?? defaultPkg.widthCm,
      length: v?.lengthCm ?? defaultPkg.lengthCm,
      weight: ((v?.weightG ?? defaultPkg.weightG) / 1000) * it.qty,
    };
  });

  const products = order.items.map((it) => ({
    name: it.nameSnapshot.slice(0, 200),
    quantity: it.qty,
    unitary_value: it.unitPriceCents / 100,
  }));

  const insuranceValueReais = order.subtotalCents / 100;

  const issuedInvoice = order.invoices[0];

  // 1. Add to cart
  let cartItem: Awaited<ReturnType<typeof meAddToCart>>;
  try {
    cartItem = await meAddToCart({
      service: order.shippingServiceId,
      from: {
        name: origin.recipient || "Brilho de Diva",
        phone: origin.phone || undefined,
        email: origin.email || undefined,
        document: origin.cnpj ? origin.cnpj.replace(/\D/g, "") : undefined,
        address: origin.street,
        number: origin.number || "s/n",
        complement: origin.complement || undefined,
        district: origin.district || "",
        city: origin.city || "",
        state_abbr: (origin.state || "").toUpperCase(),
        postal_code: origin.cep.replace(/\D/g, ""),
      },
      to: {
        name: order.customer?.name ?? addr.recipient ?? "Cliente",
        phone: order.customer?.phone ?? undefined,
        email: order.customer?.email ?? undefined,
        document: customerCpf,
        address: addr.street,
        number: addr.number,
        complement: addr.complement || undefined,
        district: addr.district,
        city: addr.city,
        state_abbr: addr.state.toUpperCase(),
        postal_code: addr.cep.replace(/\D/g, ""),
      },
      products,
      volumes,
      options: {
        insurance_value: insuranceValueReais,
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: !issuedInvoice, // use commercial flag when NF-e issued
        invoice: issuedInvoice
          ? { key: issuedInvoice.accessKey ?? undefined, number: issuedInvoice.number ?? undefined }
          : undefined,
        platform: "Brilho de Diva",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.create({
      data: {
        adapter: "melhorenvio",
        operation: "label.cart",
        status: "error",
        error: msg.slice(0, 500),
        payload: { orderId, serviceId: order.shippingServiceId },
      },
    });
    // Surface the ME message body to the admin so they can act on it.
    // Common cases: "remetente e destinatário iguais", "CEP inválido",
    // "frete excede o peso máximo do serviço".
    const detail = extractMeDetail(msg);
    return { ok: false, reason: `me_cart_error: ${detail}` };
  }

  // 2. Checkout (pay from ME balance)
  try {
    await meCheckout([cartItem.id]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.create({
      data: {
        adapter: "melhorenvio",
        operation: "label.checkout",
        status: "error",
        error: msg.slice(0, 500),
        payload: { orderId, meCartItemId: cartItem.id },
      },
    });
    return { ok: false, reason: "me_checkout_error" };
  }

  // 3. Generate label
  try {
    await meGenerate([cartItem.id]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.create({
      data: {
        adapter: "melhorenvio",
        operation: "label.generate",
        status: "error",
        error: msg.slice(0, 500),
        payload: { orderId, meCartItemId: cartItem.id },
      },
    });
    return { ok: false, reason: "me_generate_error" };
  }

  // 4. Pull the PDF + tracking (best-effort; ME may still be processing)
  let labelUrl: string | null = null;
  let trackingCode: string | null = null;
  try {
    labelUrl = await mePrintUrl([cartItem.id], "private");
  } catch (err) {
    console.warn("[label] print url fetch failed", err);
  }
  try {
    const tracking = await meTracking([cartItem.id]);
    const entry = tracking[cartItem.id];
    trackingCode = entry?.tracking ?? entry?.melhorenvio_tracking ?? null;
  } catch (err) {
    console.warn("[label] tracking fetch failed", err);
  }

  const trackingUrl = trackingCode ? meDefaultTrackingUrl(trackingCode) : null;

  const shipment = await prisma.shipment.create({
    data: {
      orderId,
      provider: "melhorenvio",
      providerShipmentId: cartItem.id,
      serviceId: order.shippingServiceId,
      carrier: order.shippingCarrier ?? "—",
      priceCents: order.shippingCents,
      status: ShipmentStatus.PURCHASED,
      trackingCode,
      trackingUrl,
      labelUrl,
      purchasedAt: new Date(),
      rawPayload: cartItem as unknown as Prisma.InputJsonValue,
    },
  });

  // Mirror to Order for backward compat + admin-list filters.
  if (trackingCode) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        trackingCode,
        trackingUrl: trackingUrl ?? undefined,
      },
    });
  }

  await recordOrderEvent(orderId, OrderEventType.LABEL_PURCHASED, {
    actor: opts.actor,
    message: `Etiqueta comprada · ${order.shippingCarrier ?? "—"} · ${order.shippingServiceId}`,
    metadata: {
      shipmentId: shipment.id,
      providerShipmentId: cartItem.id,
      labelUrl,
      trackingCode,
      priceCents: order.shippingCents,
    },
  });
  await prisma.integrationRun.create({
    data: {
      adapter: "melhorenvio",
      operation: "label.purchase",
      status: "ok",
      payload: {
        orderId,
        meCartItemId: cartItem.id,
        trackingCode,
        hasLabelUrl: Boolean(labelUrl),
      },
    },
  });

  return {
    ok: true,
    shipmentId: shipment.id,
    providerShipmentId: cartItem.id,
    labelUrl,
    trackingCode,
    reused: false,
  };
}

// Applies an inbound Melhor Envio webhook status update to the local
// Shipment row + fires the matching OrderEvent + customer email.
export async function applyShipmentWebhook(input: {
  providerShipmentId: string;
  status: ShipmentStatus;
  trackingCode?: string | null;
  message?: string | null;
  rawPayload: unknown;
}): Promise<{ orderId: string | null; changed: boolean }> {
  const existing = await prisma.shipment.findUnique({
    where: { providerShipmentId: input.providerShipmentId },
    include: {
      order: {
        select: {
          id: true,
          number: true,
          customerId: true,
          status: true,
          shippingAddress: true,
          customer: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!existing) return { orderId: null, changed: false };

  const willChange = existing.status !== input.status;

  await prisma.shipment.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      trackingCode: input.trackingCode ?? existing.trackingCode,
      trackingUrl: input.trackingCode
        ? meDefaultTrackingUrl(input.trackingCode)
        : existing.trackingUrl,
      postedAt:
        input.status === ShipmentStatus.POSTED || input.status === ShipmentStatus.IN_TRANSIT
          ? existing.postedAt ?? new Date()
          : existing.postedAt,
      deliveredAt:
        input.status === ShipmentStatus.DELIVERED ? new Date() : existing.deliveredAt,
      rawPayload: input.rawPayload as Prisma.InputJsonValue,
      lastError:
        input.status === ShipmentStatus.EXCEPTION ? (input.message ?? "exception") : null,
    },
  });

  if (input.trackingCode) {
    await prisma.order.update({
      where: { id: existing.orderId },
      data: { trackingCode: input.trackingCode, trackingUrl: meDefaultTrackingUrl(input.trackingCode) },
    });
  }

  if (!willChange || !existing.order) return { orderId: existing.orderId, changed: willChange };

  const order = existing.order;
  const addr = (order.shippingAddress ?? {}) as { recipient?: string };
  const recipient = order.customer?.email ?? null;

  if (input.status === ShipmentStatus.OUT_FOR_DELIVERY) {
    await recordOrderEvent(order.id, OrderEventType.OUT_FOR_DELIVERY, {
      actor: "webhook:melhorenvio",
      message: "Saiu para entrega",
      metadata: { shipmentId: existing.id, trackingCode: input.trackingCode },
    });
    if (recipient) {
      await sendSafe({
        channel: NotificationChannel.EMAIL,
        template: "out_for_delivery",
        data: {
          customerName: order.customer?.name ?? addr.recipient ?? null,
          orderNumber: order.number,
          trackingCode: input.trackingCode ?? existing.trackingCode ?? "",
          trackingUrl: input.trackingCode
            ? meDefaultTrackingUrl(input.trackingCode)
            : existing.trackingUrl ?? null,
          orderUrl: absoluteUrl(`/minha-conta/pedidos/${order.id}`),
        },
        recipient,
        customerId: order.customerId,
        orderId: order.id,
      });
    }
  } else if (input.status === ShipmentStatus.EXCEPTION) {
    await recordOrderEvent(order.id, OrderEventType.DELIVERY_EXCEPTION, {
      actor: "webhook:melhorenvio",
      message: input.message ?? "Problema na entrega",
      metadata: { shipmentId: existing.id },
    });
    if (recipient) {
      await sendSafe({
        channel: NotificationChannel.EMAIL,
        template: "delivery_exception",
        data: {
          customerName: order.customer?.name ?? addr.recipient ?? null,
          orderNumber: order.number,
          reason: input.message ?? "A transportadora sinalizou uma ocorrência",
          orderUrl: absoluteUrl(`/minha-conta/pedidos/${order.id}`),
        },
        recipient,
        customerId: order.customerId,
        orderId: order.id,
      });
    }
  } else if (input.status === ShipmentStatus.DELIVERED) {
    // Auto-transition the order (same path as admin "Marcar como entregue").
    if (order.status !== OrderStatus.DELIVERED) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.DELIVERED },
      });
    }
    await recordOrderEvent(order.id, OrderEventType.DELIVERED, {
      actor: "webhook:melhorenvio",
      message: "Entrega confirmada pela transportadora",
      metadata: { shipmentId: existing.id },
    });
    // Fire order_delivered email. Notification unique constraint dedupes
    // against a manual admin mark-as-delivered that already sent.
    const firstItem = await prisma.orderItem.findFirst({
      where: { orderId: order.id },
      select: { variant: { select: { product: { select: { slug: true } } } } },
    });
    const reviewUrl = firstItem?.variant.product.slug
      ? absoluteUrl(`/loja/${firstItem.variant.product.slug}#avaliacoes`)
      : absoluteUrl(`/minha-conta/pedidos/${order.id}`);
    if (recipient) {
      await sendSafe({
        channel: NotificationChannel.EMAIL,
        template: "order_delivered",
        data: {
          customerName: order.customer?.name ?? addr.recipient ?? null,
          orderNumber: order.number,
          reviewUrl,
        },
        recipient,
        customerId: order.customerId,
        orderId: order.id,
      });
    }
  } else if (input.status === ShipmentStatus.POSTED || input.status === ShipmentStatus.IN_TRANSIT) {
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.PACKED) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.SHIPPED },
      });
    }
    await recordOrderEvent(order.id, OrderEventType.SHIPPED, {
      actor: "webhook:melhorenvio",
      message: "Pedido postado na transportadora",
      metadata: { shipmentId: existing.id, trackingCode: input.trackingCode },
    });
  }

  return { orderId: order.id, changed: true };
}

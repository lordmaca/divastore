import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { OrderStatus, PaymentStatus } from "@/lib/generated/prisma/enums";
import { PaymentCard } from "@/components/account/PaymentCard";
import { OrderReviewSection, type OrderReviewItem } from "@/components/account/OrderReviewSection";
import { payOrderWithMp } from "./actions";
import { safeExternalUrl } from "@/lib/url";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  AWAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pagamento confirmado",
  PACKED: "Em separação",
  SHIPPED: "Enviado",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

// Ordered list of lifecycle states, used to render a progress bar.
const TIMELINE: OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?next=/minha-conta/pedidos/${orderId}`);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          variant: {
            select: {
              product: { select: { id: true, slug: true, name: true } },
            },
          },
        },
      },
      payments: { orderBy: { createdAt: "desc" } },
      invoices: {
        where: { status: "ISSUED" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!order) notFound();
  // Guest orders (order.customerId === null) must never be viewable through
  // the logged-in account page — they were placed without login. If the
  // customer later claimed their account, the Order.customerId is backfilled.
  // Until then, hide them. The same notFound() also covers an order that
  // belongs to a DIFFERENT customer (IDOR).
  if (!order.customerId || order.customerId !== session.user.id) notFound();

  // Build the review list only when the order is DELIVERED. Dedupe by
  // productId — a product bought in two variants still gets one entry.
  let reviewItems: OrderReviewItem[] = [];
  if (order.status === OrderStatus.DELIVERED && order.customerId) {
    const productIds = Array.from(
      new Set(order.items.map((it) => it.variant.product.id)),
    );
    const existing = await prisma.review.findMany({
      where: { customerId: order.customerId, productId: { in: productIds } },
      select: { productId: true, rating: true },
    });
    const reviewByProduct = new Map(existing.map((r) => [r.productId, r]));
    const seen = new Set<string>();
    for (const it of order.items) {
      const p = it.variant.product;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const prior = reviewByProduct.get(p.id);
      reviewItems.push({
        productId: p.id,
        productSlug: p.slug,
        productName: p.name,
        alreadyReviewed: Boolean(prior),
        existingRating: prior?.rating ?? null,
      });
    }
  }

  // Show the most recent payment — that's the one the customer cares about.
  const latestPayment = order.payments[0] ?? null;
  const issuedInvoice = order.invoices[0] ?? null;

  // Is this order still payable? Show the "Pagar com Mercado Pago" CTA
  // when the order is awaiting payment and no successful payment exists.
  const awaitingPayment =
    order.status === OrderStatus.PENDING ||
    order.status === OrderStatus.AWAITING_PAYMENT;
  const hasSuccessfulPayment = order.payments.some(
    (p) =>
      p.status === PaymentStatus.APPROVED ||
      p.status === PaymentStatus.IN_PROCESS,
  );
  const showPayCta = awaitingPayment && !hasSuccessfulPayment;

  const addr = order.shippingAddress as Record<string, string>;
  const reachedIdx = TIMELINE.findIndex((s) => s === order.status);
  const effectiveIdx = order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED
    ? -1
    : reachedIdx >= 0
      ? reachedIdx
      : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
            Pedido #{order.number}
          </h1>
          <p className="text-sm text-[color:var(--foreground)]/65">
            Feito em {new Date(order.createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <Link
          href="/minha-conta/pedidos"
          className="text-sm text-[color:var(--pink-600)] hover:underline"
        >
          ← Meus pedidos
        </Link>
      </div>

      {effectiveIdx >= 0 ? (
        <section className="glass-card rounded-2xl p-5">
          <h2 className="font-semibold text-sm mb-3">Status</h2>
          <ol className="grid grid-cols-4 gap-2 text-xs">
            {TIMELINE.map((s, i) => {
              const active = i <= effectiveIdx;
              return (
                <li
                  key={s}
                  className={`rounded-xl px-2 py-3 text-center ${
                    active
                      ? "bg-[color:var(--pink-500)] text-white"
                      : "bg-white/60 text-[color:var(--foreground)]/60"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className="glass-card rounded-2xl p-5 text-sm">
          <p className="font-semibold text-red-600">{STATUS_LABEL[order.status] ?? order.status}</p>
        </section>
      )}

      {reviewItems.length > 0 ? <OrderReviewSection items={reviewItems} /> : null}

      {showPayCta ? (
        <section className="glass-card rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-sm">Finalizar pagamento</h2>
          <p className="text-sm text-[color:var(--foreground)]/75">
            Seu pedido está aguardando pagamento. Continue pelo Mercado Pago para
            escolher entre Pix, cartão ou boleto.
          </p>
          <form action={payOrderWithMp}>
            <input type="hidden" name="orderId" value={order.id} />
            <button
              type="submit"
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium text-sm px-5 py-2.5"
            >
              Pagar com Mercado Pago
            </button>
          </form>
        </section>
      ) : null}

      {latestPayment ? (
        <PaymentCard
          method={latestPayment.method}
          status={latestPayment.status}
          amountCents={latestPayment.amountCents}
          installments={latestPayment.installments}
          installmentAmountCents={latestPayment.installmentAmountCents}
          cardLastFour={latestPayment.cardLastFour}
          pixQrCode={latestPayment.pixQrCode}
          pixQrCodeBase64={latestPayment.pixQrCodeBase64}
          pixExpiresAt={
            latestPayment.pixExpiresAt ? latestPayment.pixExpiresAt.toISOString() : null
          }
          boletoUrl={latestPayment.boletoUrl}
          boletoBarcode={latestPayment.boletoBarcode}
          boletoExpiresAt={
            latestPayment.boletoExpiresAt ? latestPayment.boletoExpiresAt.toISOString() : null
          }
          refundedCents={latestPayment.refundedCents}
          refundedAt={
            latestPayment.refundedAt ? latestPayment.refundedAt.toISOString() : null
          }
        />
      ) : null}

      {issuedInvoice ? (
        <section className="glass-card rounded-2xl p-5 space-y-2">
          <h2 className="font-semibold text-sm">Nota fiscal</h2>
          <p className="text-sm text-[color:var(--foreground)]/75">
            NF-e{" "}
            {issuedInvoice.number
              ? `${issuedInvoice.number}${issuedInvoice.serie ? "/" + issuedInvoice.serie : ""}`
              : ""}{" "}
            emitida.
          </p>
          <div className="flex flex-wrap gap-2">
            {issuedInvoice.danfeUrl ? (
              <a
                href={safeExternalUrl(issuedInvoice.danfeUrl)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium text-sm px-4 py-2"
              >
                Baixar nota fiscal (PDF)
              </a>
            ) : null}
            {issuedInvoice.xmlUrl ? (
              <a
                href={safeExternalUrl(issuedInvoice.xmlUrl)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] font-medium text-sm px-4 py-2"
              >
                Baixar XML
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {order.trackingCode ? (
        <section className="glass-card rounded-2xl p-5 space-y-2">
          <h2 className="font-semibold text-sm">Rastreio</h2>
          <p className="text-sm">
            <span className="text-[color:var(--foreground)]/65">Código:</span>{" "}
            <code className="bg-pink-50 px-2 py-0.5 rounded">{order.trackingCode}</code>
          </p>
          {order.shippingCarrier ? (
            <p className="text-sm">
              <span className="text-[color:var(--foreground)]/65">Transportadora:</span>{" "}
              {order.shippingCarrier}
            </p>
          ) : null}
          {order.trackingUrl ? (
            <a
              href={safeExternalUrl(order.trackingUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm text-[color:var(--pink-600)] hover:underline"
            >
              Rastrear na transportadora →
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold text-sm mb-3">Itens</h2>
        <ul className="divide-y divide-white/60">
          {order.items.map((it) => (
            <li key={it.id} className="py-2 flex justify-between gap-3 text-sm">
              <span className="truncate">
                {it.qty}× {it.nameSnapshot}
              </span>
              <span className="font-medium">{formatBRL(it.totalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t border-white/60 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(order.subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Frete</span>
            <span>{order.shippingCents > 0 ? formatBRL(order.shippingCents) : "Grátis"}</span>
          </div>
          {order.discountCents > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <span>Desconto {order.couponCode ? `(${order.couponCode})` : ""}</span>
              <span>−{formatBRL(order.discountCents)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-lg pt-1">
            <span>Total</span>
            <span className="text-[color:var(--pink-600)]">{formatBRL(order.totalCents)}</span>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold text-sm mb-2">Endereço de entrega</h2>
        <address className="not-italic text-sm text-[color:var(--foreground)]/80 leading-relaxed">
          {addr.recipient}
          <br />
          {addr.street}, {addr.number}
          {addr.complement ? ` — ${addr.complement}` : ""}
          <br />
          {addr.district} — {addr.city}/{addr.state}
          <br />
          CEP {addr.cep}
        </address>
      </section>
    </main>
  );
}

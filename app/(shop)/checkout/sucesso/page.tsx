import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { verifyOrderViewToken } from "@/lib/orders/viewer-token";
import { getSetting } from "@/lib/settings";
import { GoogleCustomerReviewsOptIn } from "@/components/GoogleCustomerReviewsOptIn";

export const dynamic = "force-dynamic";

// Best-effort estimated delivery date for Google Customer Reviews.
// shippingEtaDays is captured at checkout from the Melhor Envio quote;
// fall back to a generous 10-day window so we never ship a date in the
// past (Google rejects past dates with "invalid_estimated_delivery_date").
function estimatedDeliveryIso(createdAt: Date, etaDays: number | null): string {
  const days = Math.max(2, etaDays ?? 10);
  const d = new Date(createdAt);
  d.setUTCDate(d.getUTCDate() + days);
  // YYYY-MM-DD per the GCR snippet template.
  return d.toISOString().slice(0, 10);
}

// Public landing for shoppers returning from Mercado Pago. This page MUST be
// read-only with respect to order/payment state — the source of truth is the
// MP webhook (verified signature) at /api/webhooks/mercadopago. Do not flip
// statuses based on query strings.
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; pending?: string }>;
}) {
  const { orderId, pending } = await searchParams;
  if (!orderId) notFound();

  const [session, order, gcr] = await Promise.all([
    auth(),
    prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { id: true, email: true, guest: true, passwordHash: true } } },
    }),
    getSetting("integrations.googleCustomerReviews"),
  ]);
  if (!order) notFound();

  // Authorization: EITHER the logged-in user owns the order, OR the caller
  // carries the viewer cookie stamped at the end of placeOrder. The cookie
  // path is scoped to /checkout so this is the only place it's visible.
  // An anonymous attacker who guesses an orderId has neither — notFound().
  const sessionOwns = Boolean(
    session?.user && order.customerId && order.customerId === session.user.id,
  );
  let cookieOwns = false;
  if (!sessionOwns) {
    const jar = await cookies();
    cookieOwns = verifyOrderViewToken(jar.get("bd_ov")?.value ?? null, order.id);
  }
  if (!sessionOwns && !cookieOwns) notFound();

  const isPending =
    Boolean(pending) || order.status === "AWAITING_PAYMENT" || order.status === "PENDING";
  const isApproved = order.status === "PAID" || order.status === "PACKED" || order.status === "SHIPPED" || order.status === "DELIVERED";

  // Guest with no password → offer "create a password so you can track orders"
  const offerAccountClaim =
    Boolean(order.customer?.guest && !order.customer.passwordHash && order.customer.email);

  // Google Customer Reviews opt-in renders only when the order is fully
  // approved (Google rejects opt-ins for pending/cancelled orders) AND the
  // integration is enabled with a valid merchantId AND we know the
  // customer's email. Without all three, skip — better no popup than a
  // broken one.
  const showGcrOptIn =
    isApproved &&
    gcr.enabled &&
    gcr.merchantId > 0 &&
    Boolean(order.customer?.email);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      {showGcrOptIn ? (
        <GoogleCustomerReviewsOptIn
          merchantId={gcr.merchantId}
          orderId={order.id}
          email={order.customer?.email ?? ""}
          deliveryCountry="BR"
          estimatedDeliveryDate={estimatedDeliveryIso(
            order.createdAt,
            order.shippingEtaDays,
          )}
        />
      ) : null}
      <div className="glass-card rounded-3xl p-10 text-center">
        <p className="text-5xl mb-4">{isApproved ? "✨" : "⏳"}</p>
        <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
          {isPending ? "Pagamento em processamento" : "Obrigada, Diva!"}
        </h1>
        <p className="mt-3 text-[color:var(--foreground)]/75">
          Pedido <span className="font-semibold">#{order.number}</span> ·{" "}
          {formatBRL(order.totalCents)}
        </p>
        {isPending ? (
          <p className="mt-4 text-sm text-[color:var(--foreground)]/70">
            Vamos confirmar seu pagamento em instantes. Você receberá um e-mail assim que for aprovado.
          </p>
        ) : (
          <p className="mt-4 text-sm text-[color:var(--foreground)]/70">
            Já enviamos um e-mail de confirmação. Você pode acompanhar o pedido na sua conta.
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/minha-conta/pedidos/${order.id}`}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
          >
            Acompanhar pedido
          </Link>
          <Link
            href="/loja"
            className="rounded-full bg-white/70 hover:bg-white text-[color:var(--pink-600)] font-medium px-6 py-3 border border-white"
          >
            Continuar comprando
          </Link>
        </div>

        {offerAccountClaim ? (
          <div className="mt-8 border-t border-white/60 pt-6 text-sm text-[color:var(--foreground)]/75">
            <p className="mb-3">
              Crie uma senha para acessar a sua conta e acompanhar seus pedidos quando quiser.
            </p>
            <Link
              href="/recuperar-senha"
              className="inline-block rounded-full bg-white/80 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] font-medium px-5 py-2"
            >
              Criar minha senha
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}

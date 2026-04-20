import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { formatBRL } from "@/lib/money";

export const dynamic = "force-dynamic";

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

  const session = await auth();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { select: { id: true, email: true, guest: true, passwordHash: true } } },
  });
  if (!order) notFound();
  if (order.customerId && session?.user && order.customerId !== session.user.id) notFound();

  const isPending =
    Boolean(pending) || order.status === "AWAITING_PAYMENT" || order.status === "PENDING";
  const isApproved = order.status === "PAID" || order.status === "PACKED" || order.status === "SHIPPED" || order.status === "DELIVERED";

  // Guest with no password → offer "create a password so you can track orders"
  const offerAccountClaim =
    Boolean(order.customer?.guest && !order.customer.passwordHash && order.customer.email);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
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

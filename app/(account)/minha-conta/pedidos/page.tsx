import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  AWAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  PACKED: "Em separação",
  SHIPPED: "Enviado",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/minha-conta/pedidos");

  const orders = await prisma.order.findMany({
    where: { customerId: session.user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-[color:var(--pink-600)] mb-8">Meus pedidos</h1>
      {orders.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p className="mb-6 text-[color:var(--foreground)]/70">Você ainda não fez nenhum pedido.</p>
          <Link
            href="/loja"
            className="inline-flex items-center justify-center rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-8 py-3"
          >
            Explorar a coleção
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/minha-conta/pedidos/${o.id}`}
                className="block glass-card rounded-2xl p-5 hover:bg-white/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Pedido #{o.number}</p>
                    <p className="text-sm text-[color:var(--foreground)]/70">
                      {new Date(o.createdAt).toLocaleDateString("pt-BR")} · {o.items.length} {o.items.length === 1 ? "item" : "itens"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[color:var(--pink-600)]">{formatBRL(o.totalCents)}</p>
                    <p className="text-xs text-[color:var(--foreground)]/65">{STATUS_LABEL[o.status] ?? o.status}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

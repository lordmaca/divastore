import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { FULFILLED_ORDER_STATES } from "@/lib/orders";
import { AnonymizeButton } from "@/components/admin/AnonymizeButton";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: true,
      orders: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) notFound();

  const spent = customer.orders
    .filter((o) => FULFILLED_ORDER_STATES.includes(o.status))
    .reduce((a, o) => a + o.totalCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">{customer.name ?? "—"}</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">{customer.email}</p>
          <p className="text-xs text-[color:var(--foreground)]/55 mt-1">
            cadastrado {new Date(customer.createdAt).toLocaleString("pt-BR")} · role {customer.role}
          </p>
        </div>
        <AnonymizeButton id={customer.id} email={customer.email} />
      </div>

      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="Pedidos (total)" value={customer.orders.length.toString()} />
        <Stat
          label="Pedidos pagos"
          value={customer.orders.filter((o) => FULFILLED_ORDER_STATES.includes(o.status)).length.toString()}
        />
        <Stat label="Gasto total" value={formatBRL(spent)} />
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Pedidos
        </h2>
        {customer.orders.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-sm text-[color:var(--foreground)]/65">Nenhum pedido.</div>
        ) : (
          <div className="glass-card rounded-2xl divide-y divide-white/60">
            {customer.orders.map((o) => (
              <div key={o.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-mono text-xs">#{o.number}</p>
                  <p className="text-xs text-[color:var(--foreground)]/65">
                    {new Date(o.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[color:var(--pink-600)]">{formatBRL(o.totalCents)}</p>
                  <p className="text-xs text-[color:var(--foreground)]/65">{o.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Endereços ({customer.addresses.length})
        </h2>
        {customer.addresses.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/60">Nenhum endereço salvo.</p>
        ) : (
          <ul className="space-y-2">
            {customer.addresses.map((a) => (
              <li key={a.id} className="glass-card rounded-2xl p-3 text-sm">
                <p className="font-medium">{a.recipient}</p>
                <p className="text-[color:var(--foreground)]/75">
                  {a.street}, {a.number}
                  {a.complement ? ` · ${a.complement}` : ""} · {a.district} · {a.city}/{a.state} · CEP {a.cep}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Link href="/admin/clientes" className="text-sm text-[color:var(--pink-600)] hover:underline">
          ← voltar para clientes
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[color:var(--pink-600)]">{value}</p>
    </div>
  );
}

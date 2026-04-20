import { customerRegistrationsDaily, repeatPurchaseRate } from "@/lib/metrics";
import { Sparkline } from "@/components/admin/Sparkline";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ClientesReportPage() {
  const [series, repeat, totalCustomers, last30dCount] = await Promise.all([
    customerRegistrationsDaily(28),
    repeatPurchaseRate(90),
    prisma.customer.count(),
    prisma.customer.count({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const total28d = series.reduce((a, b) => a + b.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Relatório de clientes</h1>
        <p className="text-sm text-[color:var(--foreground)]/70">
          Aquisição e recompra. Recompra calcula clientes com 2+ pedidos pagos nos últimos 90 dias.
        </p>
      </div>

      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="Cadastrados (total)" value={totalCustomers.toLocaleString("pt-BR")} />
        <Stat label="Cadastrados (30d)" value={last30dCount.toLocaleString("pt-BR")} />
        <Stat label="Compradores (90d)" value={repeat.buyers.toLocaleString("pt-BR")} />
        <Stat
          label="Taxa de recompra (90d)"
          value={`${(repeat.rate * 100).toFixed(1)}%`}
          sub={`${repeat.repeat}/${repeat.buyers}`}
        />
      </section>

      <section className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">Cadastros — últimos 28 dias</p>
          <p className="text-sm text-[color:var(--foreground)]/65">{total28d} totais</p>
        </div>
        <Sparkline values={series.map((d) => d.value)} width={720} height={80} />
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[color:var(--pink-600)]">{value}</p>
      {sub ? <p className="text-xs text-[color:var(--foreground)]/55">{sub}</p> : null}
    </div>
  );
}

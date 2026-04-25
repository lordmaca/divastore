import Link from "next/link";
import { salesRange, topProducts } from "@/lib/metrics";
import { Sparkline } from "@/components/admin/Sparkline";
import { formatBRL } from "@/lib/money";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export default async function VendasReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const { from: fromQ, to: toQ } = await searchParams;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 27);
  const from = parseDate(fromQ, defaultFrom);
  const toExclusive = new Date(parseDate(toQ, today));
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  const [series, top] = await Promise.all([
    salesRange(from, toExclusive),
    topProducts(
      Math.max(1, Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000)),
      10,
    ),
  ]);

  const totalOrders = series.reduce((a, b) => a + b.orders, 0);
  const totalRevenue = series.reduce((a, b) => a + b.revenueCents, 0);
  const aov = totalOrders === 0 ? 0 : Math.round(totalRevenue / totalOrders);

  const fromIso = from.toISOString().slice(0, 10);
  const toIso = (toQ ? parseDate(toQ, today) : today).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Relatório de vendas</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">
            Pedidos pagos no intervalo (status PAID/PACKED/SHIPPED/DELIVERED).
          </p>
        </div>
        <Link
          href={`/api/admin/exports/sales.csv?from=${fromIso}&to=${toIso}`}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4 py-2"
        >
          Exportar CSV
        </Link>
      </div>

      <form className="glass-card rounded-2xl p-4 grid sm:grid-cols-3 gap-3 items-end" action="/admin/relatorios/vendas">
        <label className="block text-sm">
          <span>De</span>
          <input type="date" name="from" defaultValue={fromIso} className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span>Até</span>
          <input type="date" name="to" defaultValue={toIso} className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2" />
        </label>
        <button className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4 py-2">
          Aplicar
        </button>
      </form>

      <section className="grid sm:grid-cols-3 gap-3">
        <Stat label="Pedidos" value={totalOrders.toLocaleString("pt-BR")} />
        <Stat label="Receita" value={formatBRL(totalRevenue)} />
        <Stat label="Ticket médio" value={formatBRL(aov)} />
      </section>

      <section className="glass-card rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65 mb-2">Receita por dia</p>
        <Sparkline values={series.map((d) => d.revenueCents)} width={720} height={80} />
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Top 10 produtos no período
        </h2>
        {top.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 text-sm text-[color:var(--foreground)]/65">
            Nenhuma venda no período.
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/40 text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3">Receita</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {top.map((p, i) => (
                  <tr key={p.productId} className="border-t border-white/50">
                    <td className="px-4 py-3">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs font-mono text-[color:var(--foreground)]/60">{p.slug}</div>
                    </td>
                    <td className="px-4 py-3">{p.orders}</td>
                    <td className="px-4 py-3 font-semibold text-[color:var(--pink-600)]">{formatBRL(p.revenueCents)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/produtos/${p.productId}`} className="text-[color:var(--pink-600)] hover:underline text-xs">
                        editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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

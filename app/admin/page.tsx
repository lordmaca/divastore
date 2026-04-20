import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { FULFILLED_ORDER_STATES } from "@/lib/orders";
import { OrderStatus } from "@/lib/generated/prisma/enums";
import { getSetting } from "@/lib/settings";
import { siteFunnelDaily } from "@/lib/metrics";
import { FunnelChart } from "@/components/admin/FunnelChart";

export const dynamic = "force-dynamic";

export default async function AdminCentral() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const lowStock = await getSetting("stock.lowThreshold");

  const [
    todayRevenue,
    pendingPayment,
    paidLast24h,
    runErrors24h,
    lowStockCount,
    productsCount,
    customersCount,
    recentOrders,
    recentRuns,
    funnel,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { status: { in: FULFILLED_ORDER_STATES }, createdAt: { gte: startOfToday } },
    }),
    prisma.order.count({ where: { status: OrderStatus.AWAITING_PAYMENT } }),
    prisma.order.count({ where: { status: OrderStatus.PAID, createdAt: { gte: since24h } } }),
    prisma.integrationRun.count({ where: { status: "error", createdAt: { gte: since24h } } }),
    prisma.variant.count({ where: { stock: { lte: lowStock.units }, product: { active: true } } }),
    prisma.product.count({ where: { active: true } }),
    prisma.customer.count(),
    prisma.order.findMany({
      include: { customer: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.integrationRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    siteFunnelDaily(28),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Admin Central</h1>
        <p className="text-sm text-[color:var(--foreground)]/70 mt-1">
          Tudo da loja em um só lugar. Atalhos abaixo, alertas em destaque.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Receita hoje" value={formatBRL(todayRevenue._sum.totalCents ?? 0)} />
        <Stat label="Pagos (24h)" value={paidLast24h.toString()} />
        <Stat label="Aguardando pgto." value={pendingPayment.toString()} highlight={pendingPayment > 5} />
        <Stat
          label="Erros integração (24h)"
          value={runErrors24h.toString()}
          highlight={runErrors24h > 0}
        />
        <Stat
          label={`Estoque ≤${lowStock.units}`}
          value={lowStockCount.toString()}
          highlight={lowStockCount > 0}
        />
        <Stat label="Produtos / clientes" value={`${productsCount} / ${customersCount}`} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65">
            Funil — últimos 28 dias
          </h2>
          <Link href="/admin/relatorios/vendas" className="text-xs text-[color:var(--pink-600)] hover:underline">
            Ver relatório completo →
          </Link>
        </div>
        <FunnelChart data={funnel} />
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
          Atalhos
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink href="/admin/produtos/novo" title="Novo produto" subtitle="Criar manualmente" />
          <QuickLink href="/admin/produtos" title="Catálogo" subtitle="Listar / editar" />
          <QuickLink href="/admin/integrations" title="Integrations" subtitle="Status + execuções" />
          <QuickLink href="/admin/configuracoes" title="Configurações" subtitle="Ajustes + segredos" />
          <QuickLink href="/admin/cupons" title="Cupons" subtitle="Promoções" />
          <QuickLink href="/admin/avaliacoes" title="Avaliações" subtitle="Moderação" />
          <QuickLink href="/admin/relatorios/vendas" title="Relatório de vendas" subtitle="Período + top 10 + CSV" />
          <QuickLink href="/admin/relatorios/clientes" title="Relatório de clientes" subtitle="Registros + recompra" />
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
            Pedidos recentes
          </h2>
          <div className="glass-card rounded-2xl divide-y divide-white/60">
            {recentOrders.length === 0 ? (
              <div className="p-5 text-sm text-[color:var(--foreground)]/65">Nenhum pedido ainda.</div>
            ) : (
              recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href="/admin/pedidos"
                  className="flex items-center justify-between p-3 hover:bg-white/40"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs">#{o.number}</p>
                    <p className="text-sm truncate">
                      {o.customer?.name ?? "—"}{" "}
                      <span className="text-[color:var(--foreground)]/55">
                        {o.customer?.email ?? ""}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[color:var(--pink-600)]">{formatBRL(o.totalCents)}</p>
                    <p className="text-xs text-[color:var(--foreground)]/65">{o.status}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65 mb-3">
            Atividade de integração
          </h2>
          <div className="glass-card rounded-2xl divide-y divide-white/60">
            {recentRuns.length === 0 ? (
              <div className="p-5 text-sm text-[color:var(--foreground)]/65">Sem execuções.</div>
            ) : (
              recentRuns.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{r.adapter} · {r.operation}</p>
                    <p className="text-xs text-[color:var(--foreground)]/55">
                      {new Date(r.createdAt).toLocaleString("pt-BR")}
                      {r.durationMs != null ? ` · ${r.durationMs}ms` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs ${
                      r.status === "ok" || r.status === "stub_ok"
                        ? "bg-emerald-100 text-emerald-800"
                        : r.status === "error" || r.status === "rejected_signature"
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`glass-card rounded-2xl p-4 ${highlight ? "ring-2 ring-amber-300" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[color:var(--pink-600)]">{value}</p>
    </div>
  );
}

function QuickLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="glass-card rounded-2xl p-5 hover:-translate-y-0.5 transition-transform block"
    >
      <p className="font-medium">{title} →</p>
      <p className="text-sm text-[color:var(--foreground)]/70 mt-1">{subtitle}</p>
    </Link>
  );
}

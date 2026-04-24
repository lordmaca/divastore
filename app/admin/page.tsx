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
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
    newCustomersToday,
    newCustomers7d,
    newCustomers30d,
    registrationRuns24h,
    recentRegistrationFailures,
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
    prisma.customer.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.customer.count({ where: { createdAt: { gte: since7d } } }),
    prisma.customer.count({ where: { createdAt: { gte: since30d } } }),
    prisma.integrationRun.groupBy({
      by: ["status"],
      where: {
        adapter: "auth",
        operation: "register",
        createdAt: { gte: since24h },
      },
      _count: { status: true },
    }),
    prisma.integrationRun.findMany({
      where: {
        adapter: "auth",
        operation: "register",
        status: { notIn: ["ok", "claimed_guest", "validation_failed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Classify registration attempts in the last 24h into:
  //   - success: ok + claimed_guest
  //   - expected: rate-limits + validation + email-taken + race
  //   - outage:   anything else (db_error, unknown, …) — the "wake me up" bucket
  const regSuccessStatuses = new Set(["ok", "claimed_guest"]);
  const regExpectedStatuses = new Set([
    "validation_failed",
    "rate_limited_ip",
    "rate_limited_email",
    "email_taken",
    "race_conflict",
  ]);
  const regBreakdown = { success: 0, expected: 0, outage: 0, total: 0 };
  const regByStatus: Record<string, number> = {};
  for (const row of registrationRuns24h) {
    const count = row._count.status;
    regBreakdown.total += count;
    regByStatus[row.status] = count;
    if (regSuccessStatuses.has(row.status)) regBreakdown.success += count;
    else if (regExpectedStatuses.has(row.status)) regBreakdown.expected += count;
    else regBreakdown.outage += count;
  }
  const regDenominator = regBreakdown.success + regBreakdown.outage;
  const regSuccessRate =
    regDenominator > 0 ? Math.round((regBreakdown.success / regDenominator) * 100) : null;

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

      {/* ────────────── Cadastros — saúde do signup ────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--foreground)]/65">
            Cadastros
          </h2>
          <Link
            href="/admin/clientes"
            className="text-xs text-[color:var(--pink-600)] hover:underline"
          >
            Lista completa →
          </Link>
        </div>

        <div
          className={`glass-card rounded-2xl p-5 ${
            regBreakdown.outage > 0 ? "ring-2 ring-red-400" : ""
          }`}
        >
          {regBreakdown.outage > 0 ? (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3">
              <p className="text-sm font-semibold text-red-800">
                ⚠ {regBreakdown.outage} cadastro{regBreakdown.outage > 1 ? "s" : ""} com
                erro de sistema nas últimas 24h
              </p>
              <p className="text-xs text-red-700 mt-1">
                São falhas fora do esperado (ex.: banco indisponível), não rejeições
                normais como rate-limit ou validação. Verifique{" "}
                <Link href="/admin/observability" className="underline font-medium">
                  Observability
                </Link>{" "}
                — o scanner envia e-mail se o padrão persistir.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MiniStat label="Hoje" value={String(newCustomersToday)} subtle />
            <MiniStat label="7 dias" value={String(newCustomers7d)} subtle />
            <MiniStat label="30 dias" value={String(newCustomers30d)} subtle />
            <MiniStat
              label="Tentativas 24h"
              value={String(regBreakdown.total)}
              subtle
              detail={
                regBreakdown.expected > 0
                  ? `${regBreakdown.expected} esperadas (validação, rate-limit…)`
                  : undefined
              }
            />
            <MiniStat
              label="Taxa de sucesso 24h"
              value={regSuccessRate == null ? "—" : `${regSuccessRate}%`}
              detail={`${regBreakdown.success} ok · ${regBreakdown.outage} erro`}
              subtle={regBreakdown.outage === 0}
              alarm={regBreakdown.outage > 0 || (regSuccessRate != null && regSuccessRate < 50)}
            />
          </div>

          {regBreakdown.total > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(regByStatus)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => {
                  const tone = regSuccessStatuses.has(status)
                    ? "bg-emerald-100 text-emerald-800"
                    : regExpectedStatuses.has(status)
                      ? "bg-zinc-200 text-zinc-700"
                      : "bg-red-100 text-red-800";
                  return (
                    <span
                      key={status}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${tone}`}
                    >
                      {status}: {count}
                    </span>
                  );
                })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--foreground)]/65">
              Nenhuma tentativa de cadastro nas últimas 24h.
            </p>
          )}

          {recentRegistrationFailures.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65 mb-2">
                Falhas recentes (fora de validação)
              </p>
              <ul className="text-xs space-y-1">
                {recentRegistrationFailures.map((r) => (
                  <li
                    key={r.id}
                    className="font-mono text-[11px] text-[color:var(--foreground)]/75"
                  >
                    <span className="text-[color:var(--foreground)]/55">
                      {new Date(r.createdAt).toLocaleString("pt-BR")}
                    </span>
                    {" · "}
                    <span className="font-semibold">{r.status}</span>
                    {r.error ? (
                      <span className="text-[color:var(--foreground)]/65">
                        {" — "}
                        {r.error.slice(0, 200)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

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

function MiniStat({
  label,
  value,
  detail,
  alarm = false,
  subtle = false,
}: {
  label: string;
  value: string;
  detail?: string;
  alarm?: boolean;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        alarm
          ? "bg-red-50 border-red-200"
          : subtle
            ? "bg-white/50 border-white"
            : "bg-white/70 border-white"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-[color:var(--foreground)]/65">
        {label}
      </p>
      <p
        className={`text-lg font-semibold ${
          alarm ? "text-red-700" : "text-[color:var(--pink-600)]"
        }`}
      >
        {value}
      </p>
      {detail ? (
        <p className="text-[10px] text-[color:var(--foreground)]/65 mt-0.5 truncate" title={detail}>
          {detail}
        </p>
      ) : null}
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

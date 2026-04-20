import Link from "next/link";
import { prisma } from "@/lib/db";
import { adapters } from "@/lib/integration/registry";
import type { AdapterHealth } from "@/lib/integration/types";
import { requireAdmin } from "@/lib/admin";
import { listDivahubKeys } from "@/lib/divahub-key-actions";
import { IntegrationTestButton } from "@/components/admin/IntegrationTestButton";
import { DivahubKeyManager } from "@/components/admin/DivahubKeyManager";
import { TinyStockSyncCard } from "@/components/admin/TinyStockSyncCard";
import { testMercadoPago, testTiny, testDivaHub } from "@/lib/integration-test-actions";

export const dynamic = "force-dynamic";

const TEST_ACTIONS: Record<string, () => ReturnType<typeof testMercadoPago>> = {
  mercadopago: testMercadoPago,
  tiny: testTiny,
  divahub: testDivaHub,
};

const ADAPTER_BY_RUN_KEY: Record<string, string> = {
  mercadopago: "mercadopago",
  tiny: "tiny",
  divahub: "divahub_inbound",
};

export default async function IntegrationsPage() {
  const session = await requireAdmin();
  const [entries, keys, lastTinyStockRun] = await Promise.all([
    Promise.all(
      Object.values(adapters).map(async (a) => {
        const runAdapter = ADAPTER_BY_RUN_KEY[a.name] ?? a.name;
        const [health, enabled, runs] = await Promise.all([
          a.health(),
          a.isEnabled(),
          prisma.integrationRun.findMany({
            where: { adapter: runAdapter },
            orderBy: { createdAt: "desc" },
            take: 8,
          }),
        ]);
        return { name: a.name, enabled, health, runs };
      }),
    ),
    listDivahubKeys(session.user.id),
    prisma.integrationRun.findFirst({
      where: {
        adapter: "tiny",
        operation: { in: ["stock.reconcile", "stock.reconcile.dry"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        durationMs: true,
        error: true,
        operation: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Integration Center</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">
            Status dos adaptadores, teste manual e histórico de execuções.
          </p>
        </div>
        <Link
          href="/admin/integrations/runs"
          className="rounded-full bg-white/70 hover:bg-white text-sm font-medium px-4 py-2 border border-white"
        >
          Ver todas as execuções →
        </Link>
      </div>

      <div className="space-y-4">
        {entries.map((e) => (
          <section key={e.name} className="glass-card rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold capitalize">{e.name}</h2>
                <HealthBadge health={e.health} enabled={e.enabled} />
              </div>
              {TEST_ACTIONS[e.name] ? (
                <IntegrationTestButton
                  adapter={(e.name === "divahub" ? "divahub_inbound" : e.name) as never}
                  action={TEST_ACTIONS[e.name]}
                />
              ) : null}
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/65 mb-2">
                Últimas execuções
              </p>
              {e.runs.length === 0 ? (
                <p className="text-sm text-[color:var(--foreground)]/65">
                  Nenhuma execução registrada ainda.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {e.runs.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 font-mono text-xs">
                      <span className="text-[color:var(--foreground)]/55 w-40">
                        {new Date(r.createdAt).toLocaleString("pt-BR")}
                      </span>
                      <span className="w-32">{r.operation}</span>
                      <StatusPill status={r.status} />
                      {r.durationMs != null ? (
                        <span className="text-[color:var(--foreground)]/55">{r.durationMs}ms</span>
                      ) : null}
                      {r.error ? (
                        <span className="text-red-600 truncate" title={r.error}>
                          {r.error.slice(0, 80)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {e.name === "divahub" ? (
              <div className="mt-5 border-t border-white/60 pt-4">
                <h3 className="text-sm font-medium mb-2">Chaves de API (inbound)</h3>
                <DivahubKeyManager keys={keys} />
              </div>
            ) : null}

            {e.name === "tiny" ? (
              <div className="mt-5">
                <TinyStockSyncCard lastRun={lastTinyStockRun} />
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function HealthBadge({ health, enabled }: { health: AdapterHealth; enabled: boolean }) {
  const tone = !enabled
    ? "bg-zinc-100 text-zinc-700"
    : health.ok
      ? "bg-emerald-100 text-emerald-800"
      : "bg-amber-100 text-amber-800";
  const label = !enabled ? "desabilitado" : health.ok ? "saudável" : "atenção";
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
      <span className="text-xs text-[color:var(--foreground)]/65">{health.detail}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ok" || status === "test_ok"
      ? "bg-emerald-100 text-emerald-800"
      : status === "stub_ok"
        ? "bg-pink-100 text-pink-800"
        : status === "error" || status === "test_error" || status === "rejected_signature"
          ? "bg-red-100 text-red-700"
          : status === "manual_collision"
            ? "bg-amber-100 text-amber-800"
            : "bg-zinc-100 text-zinc-700";
  return <span className={`inline-block px-2 py-0.5 rounded-full ${tone}`}>{status}</span>;
}

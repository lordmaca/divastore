import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getSetting } from "@/lib/settings";
import { readFile } from "fs/promises";
import path from "path";
import { adapters } from "@/lib/integration/registry";
import { AlertSeverity } from "@/lib/generated/prisma/enums";
import { AlertsConfigForm } from "@/components/admin/observability/AlertsConfigForm";
import { RunScanButton } from "@/components/admin/observability/RunScanButton";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { resolveAlert, resolveAllAlerts } from "./actions";

export const dynamic = "force-dynamic";

function fmtPt(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

function relativeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const days = Math.floor(h / 24);
  return `${days}d atrás`;
}

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  INFO: "bg-sky-100 text-sky-900 border-sky-200",
  WARN: "bg-amber-100 text-amber-900 border-amber-200",
  ERROR: "bg-red-100 text-red-900 border-red-200",
};
const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  INFO: "Info",
  WARN: "Atenção",
  ERROR: "Crítico",
};

async function readBackupRows(): Promise<
  Array<{
    ts: string;
    tier: "daily" | "weekly" | "monthly";
    success: boolean;
    encryptedBytes?: number;
    objectKey?: string;
    error?: string;
  }>
> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "logs", "backup.jsonl"),
      "utf-8",
    );
    const rows = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        rows.push(JSON.parse(t));
      } catch {
        /* skip */
      }
    }
    return rows;
  } catch {
    return [];
  }
}

// The adapters exposed in the admin health API (Divinha + inbound write
// IntegrationRun rows but aren't in the registry). Used for the adapter
// health cards at the top; IntegrationRun stats below cover the rest.
async function adapterHealth() {
  return Promise.all(
    Object.values(adapters).map(async (a) => ({
      name: a.name,
      enabled: await a.isEnabled(),
      health: await a.health(),
    })),
  );
}

export default async function ObservabilityPage() {
  await requireAdmin();

  const [cfg, alertsOpen, alertsRecent, heartbeats, backupRows, hubHealth] =
    await Promise.all([
      getSetting("alerts.config"),
      prisma.alert.findMany({
        where: { resolvedAt: null },
        orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      }),
      prisma.alert.findMany({
        where: { resolvedAt: { not: null } },
        orderBy: { resolvedAt: "desc" },
        take: 10,
      }),
      prisma.cronHeartbeat.findMany({ orderBy: { name: "asc" } }),
      readBackupRows(),
      adapterHealth(),
    ]);

  // Last 24h integration stats per adapter.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const runs = await prisma.integrationRun.findMany({
    where: { createdAt: { gte: since } },
    select: { adapter: true, status: true, error: true, createdAt: true },
  });
  const statsByAdapter = new Map<
    string,
    { total: number; ok: number; lastErr?: { at: Date; status: string; error: string | null } }
  >();
  for (const r of runs) {
    const cur = statsByAdapter.get(r.adapter) ?? { total: 0, ok: 0 };
    cur.total++;
    const soft = new Set(["ok", "success", "registration_ping", "manual_collision"]);
    if (soft.has(r.status)) cur.ok++;
    else if (!cur.lastErr || cur.lastErr.at < r.createdAt) {
      cur.lastErr = { at: r.createdAt, status: r.status, error: r.error };
    }
    statsByAdapter.set(r.adapter, cur);
  }

  // Backup summary
  const dailyRows = backupRows.filter((r) => r.tier === "daily");
  const lastBackup = [...dailyRows].reverse().find((r) => r.success);
  const backupAgeH = lastBackup
    ? (Date.now() - new Date(lastBackup.ts).getTime()) / (60 * 60 * 1000)
    : null;

  // DB health for the status strip
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }

  const openCount = alertsOpen.length;
  const criticalCount = alertsOpen.filter((a) => a.severity === AlertSeverity.ERROR).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Observability</h1>
          <p className="text-sm text-[color:var(--foreground)]/70 mt-1">
            Saúde do site, integrações, crons agendados, backups e alertas por e-mail.
            Scanner automático a cada 15 minutos · destinatários em{" "}
            <code>alerts.config</code>.
          </p>
        </div>
        <RunScanButton />
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Banco de dados"
          value={dbOk ? "OK" : "Fora do ar"}
          tone={dbOk ? "good" : "bad"}
        />
        <StatCard
          label="Alertas abertos"
          value={String(openCount)}
          detail={criticalCount > 0 ? `${criticalCount} críticos` : undefined}
          tone={criticalCount > 0 ? "bad" : openCount > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Último backup"
          value={lastBackup ? relativeAgo(new Date(lastBackup.ts)) : "Nunca"}
          detail={lastBackup?.objectKey ? lastBackup.objectKey.split("/").pop() : undefined}
          tone={
            !lastBackup || backupAgeH == null || backupAgeH > cfg.backupMaxAgeHours
              ? "bad"
              : "good"
          }
        />
        <StatCard
          label="Crons instrumentados"
          value={`${heartbeats.length}`}
          detail={`${heartbeats.filter((h) => h.lastStatus === "ok").length} OK`}
          tone={
            heartbeats.some((h) => h.lastStatus === "error") ? "bad" : "good"
          }
        />
      </div>

      {/* Active alerts */}
      <section className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Alertas abertos</h2>
          {alertsOpen.length > 0 ? (
            <form action={resolveAllAlerts}>
              <button
                type="submit"
                className="text-xs text-[color:var(--foreground)]/70 hover:text-[color:var(--pink-600)]"
              >
                Resolver todos
              </button>
            </form>
          ) : null}
        </div>
        {alertsOpen.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/65">
            Nenhum alerta aberto. Tudo tranquilo por aqui ✨
          </p>
        ) : (
          <ul className="space-y-2">
            {alertsOpen.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border p-3 ${SEVERITY_STYLE[a.severity]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/70">
                        {SEVERITY_LABEL[a.severity]}
                      </span>
                      <span className="text-[10px] text-[color:var(--foreground)]/60">
                        {a.category}
                      </span>
                      <span className="font-medium text-sm">{a.title}</span>
                    </div>
                    <p className="text-xs mt-1 text-[color:var(--foreground)]/85">
                      {a.message}
                    </p>
                    <p className="text-[11px] text-[color:var(--foreground)]/60 mt-1">
                      Visto {a.occurrences}× · primeira {fmtPt(a.firstSeenAt)} · última {fmtPt(a.lastSeenAt)}
                      {a.emailedAt ? ` · e-mail ${fmtPt(a.emailedAt)}` : " · sem e-mail ainda"}
                      <span className="ml-2 font-mono text-[10px] opacity-70">{a.signature}</span>
                    </p>
                  </div>
                  <ConfirmDeleteButton
                    action={resolveAlert}
                    hiddenFields={[["id", a.id]]}
                    label="Resolver"
                    confirmMessage="Marcar este alerta como resolvido?"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Adapter health + last-24h stats */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold mb-3">Integrações</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
              <tr>
                <th className="pr-4 pb-2">Adapter</th>
                <th className="pr-4 pb-2">Saúde</th>
                <th className="pr-4 pb-2">Runs 24h</th>
                <th className="pr-4 pb-2">Taxa OK</th>
                <th className="pb-2">Último erro</th>
              </tr>
            </thead>
            <tbody>
              {hubHealth.map((h) => (
                <AdapterRow
                  key={h.name}
                  name={h.name}
                  enabled={h.enabled}
                  healthy={h.health.ok}
                  healthDetail={h.health.detail ?? null}
                  stats={statsByAdapter.get(h.name)}
                />
              ))}
              {/* Include adapters that write runs but aren't in the registry */}
              {["divahub_inbound", "divahub_divinha", "catalog"]
                .filter((name) => !hubHealth.some((h) => h.name === name))
                .map((name) => (
                  <AdapterRow
                    key={name}
                    name={name}
                    enabled={null}
                    healthy={null}
                    healthDetail="(sem health registry — estatística via IntegrationRun)"
                    stats={statsByAdapter.get(name)}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cron heartbeats */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold mb-3">Processos agendados (cron)</h2>
        {heartbeats.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/65">
            Nenhum cron instrumentado ainda. Scripts precisam usar{" "}
            <code>withCronHeartbeat</code> de{" "}
            <code>lib/observability/heartbeat.ts</code>. O scanner de alertas e
            o backup já estão cobertos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
                <tr>
                  <th className="pr-4 pb-2">Cron</th>
                  <th className="pr-4 pb-2">Agenda</th>
                  <th className="pr-4 pb-2">Último run</th>
                  <th className="pr-4 pb-2">Status</th>
                  <th className="pr-4 pb-2">Duração</th>
                  <th className="pb-2">Runs totais</th>
                </tr>
              </thead>
              <tbody>
                {heartbeats.map((h) => (
                  <tr key={h.name} className="border-t border-white/50">
                    <td className="py-2 pr-4 font-mono text-xs">{h.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{h.schedule ?? "—"}</td>
                    <td className="py-2 pr-4 text-xs">
                      {fmtPt(h.lastRunAt)} ({relativeAgo(h.lastRunAt)})
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          h.lastStatus === "ok"
                            ? "bg-emerald-100 text-emerald-800"
                            : h.lastStatus === "error"
                              ? "bg-red-100 text-red-800"
                              : "bg-zinc-200 text-zinc-700"
                        }`}
                      >
                        {h.lastStatus}
                      </span>
                      {h.lastError ? (
                        <div className="text-[11px] text-red-700 mt-1 line-clamp-1" title={h.lastError}>
                          {h.lastError}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {h.durationMs != null ? `${h.durationMs} ms` : "—"}
                    </td>
                    <td className="py-2 text-xs">{h.runCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Backup history */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold mb-3">Backups recentes</h2>
        {backupRows.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/65">
            Nenhum backup registrado em <code>logs/backup.jsonl</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
                <tr>
                  <th className="pr-4 pb-2">Quando</th>
                  <th className="pr-4 pb-2">Tier</th>
                  <th className="pr-4 pb-2">Status</th>
                  <th className="pr-4 pb-2">Tamanho cifrado</th>
                  <th className="pb-2">Chave no bucket</th>
                </tr>
              </thead>
              <tbody>
                {backupRows
                  .slice(-15)
                  .reverse()
                  .map((r, i) => (
                    <tr key={i} className="border-t border-white/50">
                      <td className="py-2 pr-4 text-xs">{fmtPt(new Date(r.ts))}</td>
                      <td className="py-2 pr-4 text-xs">{r.tier}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            r.success ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {r.success ? "OK" : "FALHA"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {r.encryptedBytes != null
                          ? `${(r.encryptedBytes / 1024).toFixed(1)} KB`
                          : "—"}
                      </td>
                      <td className="py-2 font-mono text-[11px] text-[color:var(--foreground)]/75">
                        {r.objectKey ?? (r.error ? `erro: ${r.error.slice(0, 80)}` : "—")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Alerts config */}
      <section className="glass-card rounded-2xl p-5">
        <h2 className="font-semibold mb-3">Configuração dos alertas</h2>
        <AlertsConfigForm initial={cfg} />
      </section>

      {/* Recently resolved (history) */}
      {alertsRecent.length > 0 ? (
        <section className="glass-card rounded-2xl p-5">
          <h2 className="font-semibold mb-3">Resolvidos recentemente</h2>
          <ul className="space-y-1 text-xs">
            {alertsRecent.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 text-[color:var(--foreground)]/75"
              >
                <span className="font-mono text-[10px] opacity-60">{a.signature}</span>
                <span>·</span>
                <span>{a.title}</span>
                <span className="opacity-60">
                  · resolvido em {a.resolvedAt ? fmtPt(a.resolvedAt) : "?"}{" "}
                  por {a.resolvedBy ?? "?"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "from-emerald-50 to-white"
      : tone === "warn"
        ? "from-amber-50 to-white"
        : "from-red-50 to-white";
  return (
    <div className={`glass-card rounded-2xl p-4 bg-gradient-to-br ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-wide text-[color:var(--foreground)]/60">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {detail ? (
        <p className="text-xs text-[color:var(--foreground)]/65 mt-0.5 truncate" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function AdapterRow(p: {
  name: string;
  enabled: boolean | null;
  healthy: boolean | null;
  healthDetail: string | null;
  stats?: { total: number; ok: number; lastErr?: { at: Date; status: string; error: string | null } };
}) {
  const s = p.stats;
  const rate = s && s.total > 0 ? Math.round((s.ok / s.total) * 100) : null;
  const healthBadge =
    p.healthy == null
      ? { label: "—", cls: "bg-zinc-200 text-zinc-700" }
      : p.healthy
        ? { label: "OK", cls: "bg-emerald-100 text-emerald-800" }
        : { label: "Falha", cls: "bg-red-100 text-red-800" };
  return (
    <tr className="border-t border-white/50">
      <td className="py-2 pr-4 font-mono text-xs">{p.name}</td>
      <td className="py-2 pr-4">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${healthBadge.cls}`}>
          {healthBadge.label}
        </span>
        {p.healthDetail ? (
          <div className="text-[11px] text-[color:var(--foreground)]/65 mt-1 line-clamp-1" title={p.healthDetail}>
            {p.healthDetail}
          </div>
        ) : null}
      </td>
      <td className="py-2 pr-4 text-xs">{s?.total ?? 0}</td>
      <td className="py-2 pr-4 text-xs">{rate != null ? `${rate}%` : "—"}</td>
      <td className="py-2 text-xs text-[color:var(--foreground)]/75 max-w-md truncate" title={s?.lastErr?.error ?? ""}>
        {s?.lastErr
          ? `${fmtPt(s.lastErr.at)} · ${s.lastErr.status} — ${s.lastErr.error?.slice(0, 80) ?? ""}`
          : "—"}
      </td>
    </tr>
  );
}

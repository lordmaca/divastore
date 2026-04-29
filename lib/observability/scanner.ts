import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { AlertSeverity } from "@/lib/generated/prisma/enums";

/**
 * Alert scanner. Converts raw signals (IntegrationRun rows, backup audit,
 * CronHeartbeat rows, DB health) into deduplicated `Alert` rows.
 *
 * Design:
 *   - Each check produces zero-or-more `Finding`s keyed by `signature`.
 *   - Upserted: new signature → new alert; existing + unresolved → bumps
 *     occurrences and lastSeenAt; existing + resolved → re-opens (clears
 *     resolvedAt + resolvedBy, resets emailedAt so the emailer notices).
 *   - Signals that CLEAR trigger auto-resolve: e.g. a successful run after
 *     a failure streak resolves `integration:*` for that adapter/operation.
 *
 * Signatures follow `{category}:{stable-key}` — e.g.
 *   integration:divahub_divinha:turn
 *   backup:daily:stale
 *   cron:backup-daily:missed
 *   cron:backup-daily:errored
 *   site_health:db
 */

type Finding = {
  signature: string;
  category: "integration" | "backup" | "cron" | "site_health";
  severity: AlertSeverity;
  title: string;
  message: string;
  context?: Record<string, unknown>;
};

type ScanResult = {
  openedOrUpdated: number;
  resolvedByRecovery: number;
  totalChecks: number;
};

const BACKUP_LOG_PATH = path.join(process.cwd(), "logs", "backup.jsonl");

// Every adapter we care about for alerts, plus the maximum tolerable
// window since the last run for adapters that have a recurring operation.
// `operation` null = grouping by adapter only; otherwise grouped per op.
const WATCHED_INTEGRATIONS: Array<{
  adapter: string;
  operation?: string;
  label: string;
  // Per-adapter set of statuses that count as "soft" — not counted toward
  // the failure streak. Merged with the global baseline below. Used to
  // avoid paging on expected user behavior (e.g. a rate-limited signup is
  // not an outage signal).
  softStatuses?: string[];
}> = [
  { adapter: "divahub_divinha", operation: "turn", label: "Divinha — turn" },
  { adapter: "divahub_inbound", operation: "upsertProduct", label: "DivaHub inbound — upsertProduct" },
  { adapter: "tiny", label: "Tiny ERP" },
  { adapter: "mercadopago", label: "Mercado Pago" },
  { adapter: "melhorenvio", label: "Melhor Envio" },
  {
    adapter: "auth",
    operation: "register",
    label: "Cadastro de clientes",
    // Normal rejections — don't wake anyone up.
    softStatuses: [
      "validation_failed",
      "rate_limited_ip",
      "rate_limited_email",
      "email_taken",
      "claimed_guest",
      "race_conflict",
    ],
  },
];

async function scanIntegrations(streakThreshold: number): Promise<Finding[]> {
  const findings: Finding[] = [];
  const lookbackMs = 6 * 60 * 60 * 1000; // last 6h — enough to catch a streak without blowing up the query
  const since = new Date(Date.now() - lookbackMs);

  for (const w of WATCHED_INTEGRATIONS) {
    const where: {
      adapter: string;
      createdAt: { gte: Date };
      operation?: string;
    } = {
      adapter: w.adapter,
      createdAt: { gte: since },
    };
    if (w.operation) where.operation = w.operation;

    const recent = await prisma.integrationRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.max(streakThreshold, 10),
      select: { status: true, error: true, createdAt: true },
    });
    if (recent.length === 0) continue; // no recent activity — don't alert on silence here, cron heartbeats cover that

    // Consider a run "bad" if status isn't ok/success. We treat a couple of
    // known-soft statuses as not-bad so a rate_limit 429 from upstream
    // doesn't trigger an alert on its own. Per-adapter extensions are
    // merged so adapter-specific benign statuses (e.g. `email_taken` on
    // `auth:register`) don't count as failure streak.
    const softStatuses = new Set([
      "ok",
      "success",
      "registration_ping",
      "manual_collision",
      "violation", // surfaced separately in the UI; not a system alert
      "rate_limited",
      ...(w.softStatuses ?? []),
    ]);
    const bad = recent.slice(0, streakThreshold);
    const allBad =
      bad.length >= streakThreshold && bad.every((r) => !softStatuses.has(r.status));

    const opKey = w.operation ? `:${w.operation}` : "";
    if (allBad) {
      findings.push({
        signature: `integration:${w.adapter}${opKey}:streak`,
        category: "integration",
        severity: AlertSeverity.ERROR,
        title: `${w.label} — ${bad.length} falhas consecutivas`,
        message:
          `Últimas ${bad.length} execuções de ${w.adapter}${opKey} retornaram erro. ` +
          `Último erro: ${bad[0].error?.slice(0, 300) ?? bad[0].status}.`,
        context: {
          adapter: w.adapter,
          operation: w.operation,
          lastStatus: bad[0].status,
          lastError: bad[0].error?.slice(0, 500),
          lastAt: bad[0].createdAt,
        },
      });
    }
  }
  return findings;
}

type BackupRow = {
  ts: string;
  tier: "daily" | "weekly" | "monthly";
  success: boolean;
  objectKey?: string;
  encryptedBytes?: number;
  error?: string;
};

async function readRecentBackupRows(): Promise<BackupRow[]> {
  try {
    const raw = await readFile(BACKUP_LOG_PATH, "utf-8");
    const rows: BackupRow[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const parsed = JSON.parse(t) as BackupRow;
        if (parsed.ts && typeof parsed.success === "boolean") rows.push(parsed);
      } catch {
        /* skip malformed */
      }
    }
    return rows;
  } catch {
    return [];
  }
}

async function scanBackup(maxAgeHours: number): Promise<Finding[]> {
  const findings: Finding[] = [];
  const rows = await readRecentBackupRows();
  const dailyRows = rows.filter((r) => r.tier === "daily");
  const lastSuccess = [...dailyRows].reverse().find((r) => r.success);
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  if (dailyRows.length === 0) {
    findings.push({
      signature: "backup:daily:never-ran",
      category: "backup",
      severity: AlertSeverity.WARN,
      title: "Backup diário: nenhum registro",
      message:
        "Não há nenhuma entrada em logs/backup.jsonl. O cron pode não ter rodado " +
        "ainda (aguarde 24h após o deploy) ou o script está falhando antes de escrever.",
    });
    return findings;
  }

  if (!lastSuccess || now - new Date(lastSuccess.ts).getTime() > maxAgeMs) {
    const lastAttempt = dailyRows[dailyRows.length - 1];
    findings.push({
      signature: "backup:daily:stale",
      category: "backup",
      severity: AlertSeverity.ERROR,
      title: "Backup diário atrasado",
      message:
        lastSuccess
          ? `Último backup diário bem-sucedido: ${new Date(lastSuccess.ts).toISOString()} — ` +
            `mais de ${maxAgeHours}h atrás. Última tentativa ${lastAttempt.success ? "OK" : "FALHOU"} em ${lastAttempt.ts}.`
          : `Nenhum backup diário bem-sucedido registrado. Última tentativa: ${lastAttempt.ts} ` +
            `(${lastAttempt.success ? "OK" : "FALHA: " + (lastAttempt.error ?? "?")}).`,
      context: {
        lastSuccessTs: lastSuccess?.ts,
        lastAttempt,
      },
    });
  }
  return findings;
}

// Parse a basic 5-field cron string → approximate interval in minutes.
// Coarse (worst-case); good enough to set a "missed" threshold.
//
// Order matters: check day-of-week / day-of-month BEFORE the hour/minute
// branches. Otherwise a weekly schedule like `5 3 * * 0` matches the
// "once per day" branch (numeric minute + numeric hour) and gets a 24h
// interval instead of 7 days, so the heartbeat looks "missed" 48h after
// every legitimate run.
function approxCronIntervalMinutes(expr: string | null | undefined): number {
  if (!expr) return 60; // conservative default
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 60;
  const [min, hour, dom, , dow] = parts;

  // Most-specific frequency first.
  if (/^\*\/(\d+)$/.test(min)) return Number(RegExp.$1);
  if (min === "*" && hour === "*") return 1;

  // Weekly / monthly take precedence over once-per-day so `5 3 * * 0`
  // resolves to a week, not a day. Worst case: 7d for any dow filter,
  // 30d for any dom filter. multiplier × interval is the "missed" window.
  if (dow !== "*") return 60 * 24 * 7;
  if (dom !== "*") return 60 * 24 * 30;

  // Daily / hourly fallthroughs.
  if (min === "*") return 60;
  if (/^\d+$/.test(min) && hour === "*") return 60;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) return 60 * 24;
  return 60 * 24;
}

async function scanCronHeartbeats(multiplier: number): Promise<Finding[]> {
  const findings: Finding[] = [];
  const hbs = await prisma.cronHeartbeat.findMany();
  const now = Date.now();
  for (const h of hbs) {
    const intervalMin = approxCronIntervalMinutes(h.schedule);
    const thresholdMs = Math.max(30, intervalMin * Math.max(1, multiplier)) * 60 * 1000;
    const sinceMs = now - h.lastRunAt.getTime();

    if (h.lastStatus === "error") {
      findings.push({
        signature: `cron:${h.name}:errored`,
        category: "cron",
        severity: AlertSeverity.ERROR,
        title: `Cron ${h.name} falhou`,
        message:
          `Última execução do cron ${h.name} em ${h.lastRunAt.toISOString()} ` +
          `retornou erro: ${h.lastError ?? "(sem mensagem)"}`,
        context: { name: h.name, lastRunAt: h.lastRunAt, lastError: h.lastError, schedule: h.schedule },
      });
    } else if (sinceMs > thresholdMs) {
      findings.push({
        signature: `cron:${h.name}:missed`,
        category: "cron",
        severity: AlertSeverity.WARN,
        title: `Cron ${h.name} parado`,
        message:
          `Último heartbeat em ${h.lastRunAt.toISOString()}, mais de ${Math.round(sinceMs / 60_000)} min atrás. ` +
          `Agenda esperada: ${h.schedule ?? "?"}.`,
        context: { name: h.name, lastRunAt: h.lastRunAt, schedule: h.schedule },
      });
    }
  }
  return findings;
}

async function scanSiteHealth(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    findings.push({
      signature: "site_health:db",
      category: "site_health",
      severity: AlertSeverity.ERROR,
      title: "Banco de dados fora do ar",
      message:
        "SELECT 1 falhou contra Postgres. O site inteiro está com risco — " +
        "verifique systemctl status postgresql e os logs.",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
  }
  return findings;
}

async function persistFindings(findings: Finding[]): Promise<{
  openedOrUpdated: number;
  autoResolvedSignatures: string[];
}> {
  const seen = new Set<string>();
  let openedOrUpdated = 0;

  for (const f of findings) {
    seen.add(f.signature);
    const existing = await prisma.alert.findUnique({ where: { signature: f.signature } });
    if (!existing) {
      await prisma.alert.create({
        data: {
          signature: f.signature,
          category: f.category,
          severity: f.severity,
          title: f.title,
          message: f.message,
          context: (f.context ?? null) as never,
        },
      });
      openedOrUpdated++;
    } else if (existing.resolvedAt) {
      // Re-opening a resolved alert (same condition recurred).
      await prisma.alert.update({
        where: { id: existing.id },
        data: {
          resolvedAt: null,
          resolvedBy: null,
          emailedAt: null,
          severity: f.severity,
          title: f.title,
          message: f.message,
          context: (f.context ?? null) as never,
          lastSeenAt: new Date(),
          occurrences: 1,
        },
      });
      openedOrUpdated++;
    } else {
      await prisma.alert.update({
        where: { id: existing.id },
        data: {
          severity: f.severity,
          title: f.title,
          message: f.message,
          context: (f.context ?? null) as never,
          lastSeenAt: new Date(),
          occurrences: { increment: 1 },
        },
      });
      openedOrUpdated++;
    }
  }

  // Auto-resolve: every currently-active alert that the scanner DIDN'T
  // surface this pass is implicitly healthy now. Cap the number of
  // auto-resolutions to avoid runaway behavior if the scanner itself breaks.
  const currentlyOpen = await prisma.alert.findMany({
    where: { resolvedAt: null },
    select: { id: true, signature: true },
  });
  const autoResolvedSignatures: string[] = [];
  for (const a of currentlyOpen) {
    if (!seen.has(a.signature)) {
      await prisma.alert.update({
        where: { id: a.id },
        data: { resolvedAt: new Date(), resolvedBy: "scanner:auto" },
      });
      autoResolvedSignatures.push(a.signature);
    }
  }

  return { openedOrUpdated, autoResolvedSignatures };
}

export async function runScanner(): Promise<ScanResult & { findings: Finding[] }> {
  const cfg = await getSetting("alerts.config");
  if (!cfg.enabled) {
    return { openedOrUpdated: 0, resolvedByRecovery: 0, totalChecks: 0, findings: [] };
  }

  const findings: Finding[] = [];
  findings.push(...(await scanSiteHealth()));
  findings.push(...(await scanIntegrations(cfg.integrationFailureStreak)));
  findings.push(...(await scanBackup(cfg.backupMaxAgeHours)));
  findings.push(...(await scanCronHeartbeats(cfg.cronMaxMissedMultiplier)));

  const { openedOrUpdated, autoResolvedSignatures } = await persistFindings(findings);
  return {
    openedOrUpdated,
    resolvedByRecovery: autoResolvedSignatures.length,
    totalChecks: findings.length,
    findings,
  };
}

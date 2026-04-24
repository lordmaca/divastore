import { prisma } from "@/lib/db";

/**
 * Heartbeat wrapper for scheduled scripts.
 *
 * Wrap a cron script's main function with `withCronHeartbeat("name", fn)`.
 * Writes a `CronHeartbeat` row at start (`lastStartAt`) and again at exit
 * with status + duration + lastError. The admin dashboard uses these rows
 * to detect missed/hung runs — an alert fires if the last heartbeat is too
 * old for the cron's expected interval.
 *
 * Why a dedicated table instead of parsing PM2 logs:
 *   - PM2's own process list loses history across reloads.
 *   - Some scripts are silent on success, so log-file mtime is unreliable.
 *   - A typed `lastStatus` + `durationMs` is machine-actionable for alerts.
 *
 * Errors are re-thrown — the wrapper never swallows — so PM2 still marks
 * the run as failed. Only the bookkeeping is best-effort: if the heartbeat
 * write fails, we log and keep going. An alert about unobserved crons is
 * better than a crashed script.
 */
export async function withCronHeartbeat<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { schedule?: string } = {},
): Promise<T> {
  const startedAt = new Date();
  const started = Date.now();

  await prisma.cronHeartbeat
    .upsert({
      where: { name },
      create: {
        name,
        schedule: opts.schedule,
        lastStartAt: startedAt,
        lastRunAt: startedAt,
        lastStatus: "running",
      },
      update: {
        schedule: opts.schedule ?? undefined,
        lastStartAt: startedAt,
        lastStatus: "running",
      },
    })
    .catch((err) => console.warn(`[heartbeat:${name}] start-write failed:`, err));

  try {
    const result = await fn();
    await prisma.cronHeartbeat
      .update({
        where: { name },
        data: {
          lastRunAt: new Date(),
          lastStatus: "ok",
          lastError: null,
          durationMs: Date.now() - started,
          runCount: { increment: 1 },
        },
      })
      .catch((err) => console.warn(`[heartbeat:${name}] ok-write failed:`, err));
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.cronHeartbeat
      .update({
        where: { name },
        data: {
          lastRunAt: new Date(),
          lastStatus: "error",
          lastError: msg.slice(0, 500),
          durationMs: Date.now() - started,
          runCount: { increment: 1 },
        },
      })
      .catch((e) => console.warn(`[heartbeat:${name}] err-write failed:`, e));
    throw err;
  }
}

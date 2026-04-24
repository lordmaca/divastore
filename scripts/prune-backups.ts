/**
 * Enforce backup retention on the brilhodediva-backups OCI bucket.
 *
 * Retention windows (same as DivaHub — keep parity unless we find a reason
 * to diverge):
 *   daily/   — keep 30 days
 *   weekly/  — keep 84 days (12 weeks)
 *   monthly/ — keep 365 days
 *
 * Deletes archive.tar.gpg + manifest.json older than the window.
 * Dry-run by default — print only. Pass --delete to actually delete.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/prune-backups.ts           # dry-run
 *   npx tsx --env-file=.env.local scripts/prune-backups.ts --delete  # actually prune
 */

import { deleteObject, listObjects, getBackupBucket } from "@/lib/storage/oci-backup";

const RETENTION_DAYS: Record<string, number> = {
  daily: 30,
  weekly: 84,
  monthly: 365,
};

async function main() {
  const dryRun = !process.argv.includes("--delete");
  const now = Date.now();
  const bucket = getBackupBucket();

  console.log(`[prune] bucket=${bucket} ${dryRun ? "(dry-run)" : "(LIVE — will delete)"}`);

  for (const [tier, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const objects = await listObjects(`${tier}/`);
    const stale = objects.filter((o) => o.modifiedAt.getTime() < cutoff);

    console.log(
      `[prune] tier=${tier} retention=${days}d total=${objects.length} stale=${stale.length}`,
    );
    for (const o of stale) {
      const ageDays = Math.round(
        (now - o.modifiedAt.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (dryRun) {
        console.log(`  [dry] would delete ${o.key} (age=${ageDays}d, ${o.sizeBytes} bytes)`);
      } else {
        try {
          await deleteObject(o.key);
          console.log(`  deleted ${o.key} (age=${ageDays}d)`);
        } catch (err) {
          console.warn(
            `  FAILED ${o.key}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Scheduled alert scanner. Runs every 15 min via PM2.
 *
 *   1. Scan integration runs, backup log, cron heartbeats, DB health.
 *   2. Upsert Alert rows (dedupe by signature; auto-resolve cleared signals).
 *   3. Email the admin recipients if there are alerts due per cooldown.
 *   4. Write its own heartbeat so the scanner itself can alert if stopped.
 *
 * Usage: `npx tsx --env-file=.env.local scripts/alert-scanner.ts`
 */

import { withCronHeartbeat } from "@/lib/observability/heartbeat";
import { runScanner } from "@/lib/observability/scanner";
import { runEmailer } from "@/lib/observability/emailer";
import { prisma } from "@/lib/db";

async function main() {
  const scan = await runScanner();
  console.log(
    `[alert-scanner] findings=${scan.totalChecks} updated=${scan.openedOrUpdated} auto-resolved=${scan.resolvedByRecovery}`,
  );
  const mail = await runEmailer();
  console.log(
    `[alert-scanner] emails sent=${mail.sent} skipped-by-cooldown=${mail.skippedByCooldown} recipients=${mail.recipients.length}`,
  );
}

withCronHeartbeat("alert-scanner", main, { schedule: "*/15 * * * *" })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

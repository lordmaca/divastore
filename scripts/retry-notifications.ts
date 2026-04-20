// PM2 cron entry: sweeps FAILED Notification rows and retries them with
// exponential backoff. Idempotent — the dispatcher only promotes a row to
// SENT if the channel adapter returned successfully.

import { prisma } from "../lib/db";
import { sweepFailed } from "../lib/notifications/dispatch";

async function main() {
  const { tried, sent } = await sweepFailed(50);
  console.log(`[retry-notifications] tried=${tried} sent=${sent}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[retry-notifications] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

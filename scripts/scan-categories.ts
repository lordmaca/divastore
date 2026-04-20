// PM2 cron (daily 04:00 BRT) + `bdd categorize-scan`. Scans every active
// product, auto-applies high-confidence mismatches when the setting is on,
// and opens CategoryAuditIssue rows for everything else.

import { prisma } from "../lib/db";
import { scanAllProducts } from "../lib/catalog/scan";

async function main() {
  const dry = process.argv.includes("--dry");
  const out = await scanAllProducts({ dryRun: dry });
  console.log(
    `[category-scan]${dry ? " (dry)" : ""} scanned=${out.scanned} opened=${out.opened} autoApplied=${out.autoApplied} resolved=${out.resolved} skipped=${out.skipped}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[category-scan] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

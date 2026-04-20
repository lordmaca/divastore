// CLI helper invoked by `./scripts/bdd categorize-apply`.
// Applies every OPEN, high-confidence CategoryAuditIssue in one pass.

import { prisma } from "../lib/db";
import { applyAllHighConfidenceIssues } from "../lib/catalog/scan";

async function main() {
  const applied = await applyAllHighConfidenceIssues("cli");
  console.log(`[categorize-apply] applied=${applied} high-confidence issues`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[categorize-apply] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

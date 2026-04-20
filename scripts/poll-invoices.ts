// PM2 cron entry: picks up Invoice rows in REQUESTED state that are older
// than 60s and asks Tiny for the latest SEFAZ status. Promotes to ISSUED /
// FAILED / CANCELLED and fires the `invoice_issued` email on transition
// to ISSUED.

import { prisma } from "../lib/db";
import { sweepPendingInvoices } from "../lib/invoices";

async function main() {
  const { processed, promoted, failed } = await sweepPendingInvoices(20);
  console.log(`[invoice-poll] processed=${processed} promoted=${promoted} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[invoice-poll] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

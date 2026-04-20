// CLI helper invoked by `./scripts/bdd invoice <orderNumber>`.
// Looks up the order by number, runs the issuance orchestrator, prints result.

import { prisma } from "../lib/db";
import { issueInvoice } from "../lib/invoices";

async function main() {
  const numArg = process.argv[2];
  const orderNumber = Number(numArg);
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) {
    console.error("Usage: tsx scripts/issue-invoice-cli.ts <orderNumber>");
    process.exit(2);
  }

  const order = await prisma.order.findUnique({
    where: { number: orderNumber },
    select: { id: true, number: true, status: true, tinyOrderId: true },
  });
  if (!order) {
    console.error(`Order #${orderNumber} not found`);
    process.exit(1);
  }

  const res = await issueInvoice(order.id, { actor: "cli", reason: "cli" });
  if (res.ok) {
    console.log(`[issue-invoice] order #${order.number} → invoice ${res.invoiceId}${res.reused ? " (reused)" : " (new)"}`);
  } else {
    console.error(`[issue-invoice] order #${order.number} failed: ${res.reason}`);
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[issue-invoice] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

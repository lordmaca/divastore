// CLI helper invoked by `./scripts/bdd delete-order <orderNumber> --reason="..."`.
// Runs the same guardrails as the admin UI.

import { prisma } from "../lib/db";
import { softDeleteOrder, REASON_LABEL } from "../lib/orders/delete";

function parseArgs(argv: string[]) {
  let orderNumber: string | undefined;
  const rest: string[] = [];
  for (const a of argv) {
    if (a.startsWith("--reason=")) rest.push(a.slice("--reason=".length));
    else if (!orderNumber) orderNumber = a;
    else rest.push(a);
  }
  return { orderNumber, reason: rest.join(" ").trim() };
}

async function main() {
  const { orderNumber, reason } = parseArgs(process.argv.slice(2));
  if (!orderNumber) {
    console.error(
      'Usage: tsx scripts/delete-order-cli.ts <orderNumber> --reason="..."',
    );
    process.exit(2);
  }
  if (!reason) {
    console.error('Missing --reason="..." (min 10 chars)');
    process.exit(2);
  }
  const order = await prisma.order.findUnique({
    where: { number: Number(orderNumber) },
    select: { id: true, number: true },
  });
  if (!order) {
    console.error(`Order #${orderNumber} not found`);
    process.exit(1);
  }
  const res = await softDeleteOrder({
    orderId: order.id,
    reason,
    actor: "cli",
  });
  if (res.ok) {
    console.log(`[delete-order] order #${order.number} soft-deleted`);
  } else {
    console.error(`[delete-order] refused: ${res.reason} — ${REASON_LABEL[res.reason]}`);
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[delete-order] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

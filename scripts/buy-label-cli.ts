// CLI helper invoked by `./scripts/bdd label <orderNumber>`.

import { prisma } from "../lib/db";
import { purchaseShippingLabel } from "../lib/shipments";

async function main() {
  const numArg = process.argv[2];
  const orderNumber = Number(numArg);
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) {
    console.error("Usage: tsx scripts/buy-label-cli.ts <orderNumber>");
    process.exit(2);
  }
  const order = await prisma.order.findUnique({
    where: { number: orderNumber },
    select: { id: true, number: true },
  });
  if (!order) {
    console.error(`Order #${orderNumber} not found`);
    process.exit(1);
  }
  const res = await purchaseShippingLabel(order.id, { actor: "cli" });
  if (res.ok) {
    console.log(
      `[label] order #${order.number} → shipment ${res.shipmentId}${res.reused ? " (reused)" : ""}${res.trackingCode ? ` · tracking ${res.trackingCode}` : ""}${res.labelUrl ? `\n        label: ${res.labelUrl}` : ""}`,
    );
  } else {
    console.error(`[label] failed: ${res.reason}`);
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[label] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

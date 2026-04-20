// CLI helper invoked by `./scripts/bdd refund <orderNumber> [amount] <reason>`.
// Triggers the refund orchestrator as if an admin clicked the button.

import { prisma } from "../lib/db";
import { refundPayment } from "../lib/refunds";

function parseArgs(argv: string[]) {
  let amountReais: string | undefined;
  let orderNumber: string | undefined;
  const rest: string[] = [];
  for (const a of argv) {
    if (a.startsWith("--amount=")) amountReais = a.slice("--amount=".length);
    else if (a.startsWith("--reason=")) rest.push(a.slice("--reason=".length));
    else if (!orderNumber) orderNumber = a;
    else rest.push(a);
  }
  const reason = rest.join(" ").trim();
  return { orderNumber, amountReais, reason };
}

async function main() {
  const { orderNumber, amountReais, reason } = parseArgs(process.argv.slice(2));
  if (!orderNumber) {
    console.error(
      'Usage: tsx scripts/refund-cli.ts <orderNumber> [--amount=R$X] --reason="..." ',
    );
    process.exit(2);
  }
  if (!reason) {
    console.error("Missing --reason=\"...\" (min 10 chars)");
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

  const amountCents = amountReais
    ? Math.round(Number(amountReais.replace(",", ".")) * 100)
    : undefined;

  const res = await refundPayment({
    orderId: order.id,
    amountCents,
    reason,
    actor: "cli",
  });

  if (res.ok) {
    console.log(
      `[refund] order #${order.number} → mp refund ${res.refundId} (R$${(res.amountCents / 100).toFixed(2)}${res.fullyRefunded ? ", total" : ", parcial"})`,
    );
  } else {
    console.error(`[refund] failed: ${res.reason}`);
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[refund] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

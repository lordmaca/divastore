// PM2 cron entry: finds carts that look abandoned and enqueues a recovery
// email. Dedup is enforced manually via a per-customer notification lookup
// (Notification.orderId is a real FK so we can't use synthetic ids — we
// leave orderId null for abandoned-cart rows and track by customerId).
//
// Gating:
//   - Cart must have items AND a recognizable customer (email known).
//   - Customer.marketingOptIn must be true — LGPD requires explicit consent.
//   - Cart.updatedAt >= 4h ago and <= 7 days ago.
//   - Don't re-nudge within 24h. Stop after the second nudge.

import { prisma } from "../lib/db";
import { NotificationChannel, NotificationStatus } from "../lib/generated/prisma/enums";
import { sendSafe } from "../lib/notifications/dispatch";
import { absoluteUrl } from "../lib/notifications/templates/shared";

const FIRST_NUDGE_MS = 4 * 60 * 60 * 1000;
const SECOND_NUDGE_MS = 24 * 60 * 60 * 1000;
const ABANDON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NUDGES = 2;

async function main() {
  const now = Date.now();
  const oldest = new Date(now - ABANDON_WINDOW_MS);
  const freshest = new Date(now - FIRST_NUDGE_MS);

  const carts = await prisma.cart.findMany({
    where: {
      updatedAt: { gte: oldest, lte: freshest },
      customerId: { not: null },
      items: { some: {} },
    },
    include: {
      customer: { select: { id: true, email: true, name: true, marketingOptIn: true } },
      items: {
        include: {
          variant: { include: { product: { select: { name: true } } } },
        },
      },
    },
    take: 200,
  });

  let sent = 0;
  let skipped = 0;
  for (const cart of carts) {
    if (!cart.customer?.email || !cart.customer.marketingOptIn) {
      skipped++;
      continue;
    }

    const priorSent = await prisma.notification.findMany({
      where: {
        customerId: cart.customer.id,
        template: "abandoned_cart",
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
      },
      orderBy: { sentAt: "desc" },
      take: MAX_NUDGES,
    });

    if (priorSent.length >= MAX_NUDGES) {
      skipped++;
      continue;
    }
    if (
      priorSent[0]?.sentAt &&
      now - priorSent[0].sentAt.getTime() < SECOND_NUDGE_MS
    ) {
      skipped++;
      continue;
    }

    await sendSafe({
      channel: NotificationChannel.EMAIL,
      template: "abandoned_cart",
      data: {
        customerName: cart.customer.name,
        items: cart.items.map((it) => ({
          name: it.variant.product.name,
          qty: it.qty,
          totalCents: it.qty * it.variant.priceCents,
        })),
        resumeUrl: absoluteUrl("/carrinho"),
        unsubscribeUrl: absoluteUrl(`/unsubscribe?cid=${encodeURIComponent(cart.customer.id)}`),
      },
      recipient: cart.customer.email,
      customerId: cart.customer.id,
      // leave orderId null — no synthetic FKs.
    });
    sent++;
  }

  console.log(`[abandoned-cart] scanned=${carts.length} sent=${sent} skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[abandoned-cart] fatal", err);
  await prisma.$disconnect();
  process.exit(1);
});

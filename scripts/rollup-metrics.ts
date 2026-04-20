import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

// Daily idempotent rollup. By default rolls up yesterday + today (so a same-day
// re-run keeps current numbers fresh without losing yesterday's frozen value).
// Pass --days N to backfill N days (cron passes nothing).

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

function utcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

async function rollupDay(day: Date): Promise<{ day: string; rows: number }> {
  const from = utcDay(day);
  const to = new Date(from.getTime() + 86_400_000);

  // Per-product views
  const views = await prisma.$queryRaw<Array<{ productId: string; views: bigint }>>`
    SELECT "productId", COUNT(*)::bigint AS views
    FROM "PageView"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to} AND "productId" IS NOT NULL
    GROUP BY 1`;

  // Per-product add-to-cart
  const atc = await prisma.$queryRaw<Array<{ productId: string; n: bigint }>>`
    SELECT "productId", COUNT(*)::bigint AS n
    FROM "FunnelEvent"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      AND type = 'ADD_TO_CART'::"FunnelEventType" AND "productId" IS NOT NULL
    GROUP BY 1`;

  // Per-product paid orders + revenue (use OrderItem to attribute revenue)
  const sales = await prisma.$queryRaw<
    Array<{ productId: string; orders: bigint; revenueCents: bigint }>
  >`
    SELECT v."productId",
           COUNT(DISTINCT o.id)::bigint AS orders,
           SUM(oi."totalCents")::bigint AS "revenueCents"
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "Variant" v ON v.id = oi."variantId"
    WHERE o."createdAt" >= ${from} AND o."createdAt" < ${to}
      AND o.status IN ('PAID','PACKED','SHIPPED','DELIVERED')
    GROUP BY 1`;

  const productIds = new Set<string>([
    ...views.map((r) => r.productId),
    ...atc.map((r) => r.productId),
    ...sales.map((r) => r.productId),
  ]);

  const viewsMap = new Map(views.map((r) => [r.productId, Number(r.views)]));
  const atcMap = new Map(atc.map((r) => [r.productId, Number(r.n)]));
  const ordersMap = new Map(sales.map((r) => [r.productId, Number(r.orders)]));
  const revenueMap = new Map(sales.map((r) => [r.productId, Number(r.revenueCents ?? 0)]));

  for (const productId of productIds) {
    await prisma.productMetricDaily.upsert({
      where: { productId_day: { productId, day: from } },
      create: {
        productId,
        day: from,
        views: viewsMap.get(productId) ?? 0,
        addsToCart: atcMap.get(productId) ?? 0,
        ordersPaid: ordersMap.get(productId) ?? 0,
        revenueCents: revenueMap.get(productId) ?? 0,
      },
      update: {
        views: viewsMap.get(productId) ?? 0,
        addsToCart: atcMap.get(productId) ?? 0,
        ordersPaid: ordersMap.get(productId) ?? 0,
        revenueCents: revenueMap.get(productId) ?? 0,
      },
    });
  }
  return { day: from.toISOString().slice(0, 10), rows: productIds.size };
}

async function main() {
  const argDays = (() => {
    const i = process.argv.indexOf("--days");
    return i >= 0 ? Math.max(1, Number(process.argv[i + 1] ?? "2")) : 2;
  })();

  const today = utcDay(new Date());
  const days: Date[] = [];
  for (let i = argDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d);
  }
  for (const d of days) {
    const r = await rollupDay(d);
    console.log(`rolled up ${r.day} → ${r.rows} product rows`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

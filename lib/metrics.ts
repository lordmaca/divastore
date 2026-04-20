import { prisma } from "@/lib/db";
import { FULFILLED_ORDER_STATES } from "@/lib/orders";
import { FunnelEventType, OrderStatus } from "@/lib/generated/prisma/enums";

// Time-series helpers. All queries bucket by UTC day for stable rollup
// alignment; presentation can localize.

export function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function utcDaysAgo(n: number): Date {
  const x = startOfUtcDay(new Date());
  x.setUTCDate(x.getUTCDate() - n);
  return x;
}

export type DayBucket = { day: string; value: number };

function fillSeries(rows: Array<{ day: Date; value: number | bigint }>, since: Date, until: Date): DayBucket[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.day.toISOString().slice(0, 10), Number(r.value));
  const out: DayBucket[] = [];
  for (let d = new Date(since); d <= until; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, value: map.get(key) ?? 0 });
  }
  return out;
}

export async function siteFunnelDaily(days = 28) {
  const since = utcDaysAgo(days - 1);
  const until = startOfUtcDay(new Date());

  const [views, atc, beg, paid] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc('day', "createdAt")::timestamp AS day, COUNT(*)::bigint AS value
      FROM "PageView"
      WHERE "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc('day', "createdAt")::timestamp AS day, COUNT(*)::bigint AS value
      FROM "FunnelEvent"
      WHERE "createdAt" >= ${since} AND type = 'ADD_TO_CART'::"FunnelEventType"
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc('day', "createdAt")::timestamp AS day, COUNT(*)::bigint AS value
      FROM "FunnelEvent"
      WHERE "createdAt" >= ${since} AND type = 'BEGIN_CHECKOUT'::"FunnelEventType"
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc('day', "createdAt")::timestamp AS day, COUNT(*)::bigint AS value
      FROM "FunnelEvent"
      WHERE "createdAt" >= ${since} AND type = 'ORDER_PAID'::"FunnelEventType"
      GROUP BY 1 ORDER BY 1`,
  ]);

  return {
    views: fillSeries(views, since, until),
    addsToCart: fillSeries(atc, since, until),
    beginCheckout: fillSeries(beg, since, until),
    ordersPaid: fillSeries(paid, since, until),
  };
}

export async function productMetricsDaily(productId: string, days = 28) {
  const since = utcDaysAgo(days - 1);
  const until = startOfUtcDay(new Date());

  const [views, atc, paid] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc('day', "createdAt")::timestamp AS day, COUNT(*)::bigint AS value
      FROM "PageView"
      WHERE "createdAt" >= ${since} AND "productId" = ${productId}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc('day', "createdAt")::timestamp AS day, COUNT(*)::bigint AS value
      FROM "FunnelEvent"
      WHERE "createdAt" >= ${since} AND "productId" = ${productId}
        AND type = 'ADD_TO_CART'::"FunnelEventType"
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc('day', oi."createdAt")::timestamp AS day, COUNT(DISTINCT o.id)::bigint AS value
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Variant" v ON v.id = oi."variantId"
      WHERE oi."createdAt" >= ${since} AND v."productId" = ${productId}
        AND o.status IN ('PAID','PACKED','SHIPPED','DELIVERED')
      GROUP BY 1 ORDER BY 1`,
  ]);

  return {
    views: fillSeries(views, since, until),
    addsToCart: fillSeries(atc, since, until),
    ordersPaid: fillSeries(paid, since, until),
  };
}

export async function topProducts(days = 28, limit = 10) {
  const since = utcDaysAgo(days - 1);
  const rows = await prisma.$queryRaw<
    Array<{ productId: string; slug: string; name: string; revenueCents: bigint; orders: bigint }>
  >`
    SELECT v."productId", p.slug, p.name,
           SUM(oi."totalCents")::bigint AS "revenueCents",
           COUNT(DISTINCT o.id)::bigint AS orders
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "Variant" v ON v.id = oi."variantId"
    JOIN "Product" p ON p.id = v."productId"
    WHERE o."createdAt" >= ${since}
      AND o.status IN ('PAID','PACKED','SHIPPED','DELIVERED')
    GROUP BY 1, 2, 3
    ORDER BY "revenueCents" DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    productId: r.productId,
    slug: r.slug,
    name: r.name,
    revenueCents: Number(r.revenueCents),
    orders: Number(r.orders),
  }));
}

export async function customerRegistrationsDaily(days = 28) {
  const since = utcDaysAgo(days - 1);
  const until = startOfUtcDay(new Date());
  const rows = await prisma.$queryRaw<Array<{ day: Date; value: bigint }>>`
    SELECT date_trunc('day', "createdAt")::timestamp AS day, COUNT(*)::bigint AS value
    FROM "Customer"
    WHERE "createdAt" >= ${since}
    GROUP BY 1 ORDER BY 1`;
  return fillSeries(rows, since, until);
}

export async function repeatPurchaseRate(days = 90): Promise<{ buyers: number; repeat: number; rate: number }> {
  const since = utcDaysAgo(days - 1);
  const rows = await prisma.$queryRaw<Array<{ buyers: bigint; repeat: bigint }>>`
    WITH counts AS (
      SELECT "customerId", COUNT(*)::int AS n
      FROM "Order"
      WHERE "customerId" IS NOT NULL
        AND "createdAt" >= ${since}
        AND status IN ('PAID','PACKED','SHIPPED','DELIVERED')
      GROUP BY 1
    )
    SELECT
      COUNT(*)::bigint AS buyers,
      SUM(CASE WHEN n >= 2 THEN 1 ELSE 0 END)::bigint AS repeat
    FROM counts`;
  const r = rows[0] ?? { buyers: BigInt(0), repeat: BigInt(0) };
  const buyers = Number(r.buyers);
  const repeat = Number(r.repeat);
  return { buyers, repeat, rate: buyers === 0 ? 0 : repeat / buyers };
}

export async function salesRange(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<Array<{ day: Date; orders: bigint; revenueCents: bigint }>>`
    SELECT date_trunc('day', "createdAt")::timestamp AS day,
           COUNT(*)::bigint AS orders,
           SUM("totalCents")::bigint AS "revenueCents"
    FROM "Order"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      AND status IN ('PAID','PACKED','SHIPPED','DELIVERED')
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    orders: Number(r.orders),
    revenueCents: Number(r.revenueCents ?? 0),
  }));
}

export const FUNNEL_LABELS: Record<keyof Awaited<ReturnType<typeof siteFunnelDaily>>, string> = {
  views: "Visitas (PDP+lista)",
  addsToCart: "Add to cart",
  beginCheckout: "Iniciou checkout",
  ordersPaid: "Pedidos pagos",
};

// Use FULFILLED_ORDER_STATES + OrderStatus to keep type imports referenced;
// raw SQL above mirrors the same list.
export const _enumRefs = { FULFILLED_ORDER_STATES, OrderStatus, FunnelEventType };

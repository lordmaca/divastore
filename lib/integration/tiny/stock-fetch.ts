import { prisma } from "@/lib/db";
import { TinyError, tinyGetStockBySku } from "./http";

// Builds the SKU → Tiny stock map for the entire active catalog. Returns
// the map plus a list of SKUs Tiny failed on. Callers decide what to do
// with failures: the cron treats any failure as "don't run authoritative
// reconcile" since we can't distinguish "missing from Tiny" from "Tiny
// couldn't tell us."
export async function buildFullCatalogSnapshot(opts: {
  chunkSize?: number;
  chunkDelayMs?: number;
} = {}): Promise<{
  snapshot: Map<string, number | null>;
  errors: Array<{ sku: string; message: string }>;
}> {
  const chunkSize = opts.chunkSize ?? 20;
  const chunkDelayMs = opts.chunkDelayMs ?? 300;

  const variants = await prisma.$queryRaw<{ sku: string }[]>`
    SELECT v.sku
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    WHERE p.active = true
    ORDER BY v.sku ASC
  `;

  const snapshot = new Map<string, number | null>();
  const errors: Array<{ sku: string; message: string }> = [];

  for (let i = 0; i < variants.length; i += chunkSize) {
    const chunk = variants.slice(i, i + chunkSize);
    // Within a chunk, fetch sequentially to stay under Tiny's per-second
    // rate limit. Parallelism doesn't save much here because we'd just
    // burn our token bucket faster.
    for (const v of chunk) {
      try {
        const stock = await tinyGetStockBySku(v.sku);
        snapshot.set(v.sku, stock);
      } catch (err) {
        const msg =
          err instanceof TinyError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        errors.push({ sku: v.sku, message: msg });
      }
    }
    if (i + chunkSize < variants.length) {
      await new Promise((r) => setTimeout(r, chunkDelayMs));
    }
  }

  return { snapshot, errors };
}

import { prisma } from "@/lib/db";
import { TinyError, tinyGetStockBySku } from "./http";

// Builds the SKU → Tiny stock map for the entire active catalog. Returns:
//   - snapshot: Map<sku, number | null> (found, with/without stock)
//   - errors[]: HARD failures (auth/5xx/net). Cron treats these as
//       "abort — can't tell missing apart from unreachable".
//   - unreachable[]: SOFT failures (rate-limit). Cron tolerates these —
//       the affected SKUs keep their current stock until the next run.
//
// The split matters for rate-limit specifically: Tiny v2 caps 60 req/min,
// and each SKU is 2 hits. Occasional overruns happen even with backoff,
// and we don't want a 1-SKU blip to abort the whole reconcile.
export async function buildFullCatalogSnapshot(opts: {
  chunkSize?: number;
  chunkDelayMs?: number;
} = {}): Promise<{
  snapshot: Map<string, number | null>;
  errors: Array<{ sku: string; message: string }>;
  unreachable: Array<{ sku: string; message: string }>;
}> {
  // Tiny v2 free tier = 60 req/min. Each SKU lookup = 2 HTTP hits
  // (pesquisa + obter.estoque). Default pace = ~10 SKUs per second worth
  // of HTTP hits, with a 1.2s breather between chunks — plus withRetry's
  // rate-limit backoff handles occasional overruns gracefully.
  const chunkSize = opts.chunkSize ?? 5;
  const chunkDelayMs = opts.chunkDelayMs ?? 1200;

  const variants = await prisma.$queryRaw<{ sku: string }[]>`
    SELECT v.sku
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    WHERE p.active = true
    ORDER BY v.sku ASC
  `;

  const snapshot = new Map<string, number | null>();
  const errors: Array<{ sku: string; message: string }> = [];
  const unreachable: Array<{ sku: string; message: string }> = [];

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
        if (/API Bloqueada|Excedido.*acessos/i.test(msg)) {
          unreachable.push({ sku: v.sku, message: msg });
        } else {
          errors.push({ sku: v.sku, message: msg });
        }
      }
    }
    if (i + chunkSize < variants.length) {
      await new Promise((r) => setTimeout(r, chunkDelayMs));
    }
  }

  return { snapshot, errors, unreachable };
}

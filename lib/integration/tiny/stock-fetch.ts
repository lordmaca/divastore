import { prisma } from "@/lib/db";
import {
  TinyError,
  tinyGetStockBySku,
  tinyGetStockByProductId,
  tinyListProductsPage,
  withRetry,
} from "./http";

// Builds the SKU → Tiny stock map for the entire active catalog. Returns:
//   - snapshot: Map<sku, number | null> (found, with/without stock)
//   - errors[]: HARD failures (auth/5xx/net). Cron treats these as
//       "abort — can't tell missing apart from unreachable".
//   - unreachable[]: SOFT failures (rate-limit). Cron tolerates these —
//       the affected SKUs keep their current stock until the next run.
//
// Strategy (Tiny v2 caps 60 req/min):
//   1. **Bulk paginate** `produtos.pesquisa.php` (100 items/page). Tiny
//      v2 returns product METADATA (id, codigo, nome, preco) — but NOT
//      stock. So we use this phase to build a SKU → productId map at
//      ~1 HTTP call per 100 SKUs.
//   2. For every storefront SKU present in the map, fetch stock by id
//      via `produto.obter.estoque.php` — single HTTP hit per SKU, no
//      redundant pesquisa. For 20 SKUs: ~1 bulk call + 20 stock calls
//      = 21 hits (was 40 under the legacy path).
//   3. SKUs not present in Tiny's catalog fall through to the legacy
//      per-SKU path so we still get a definitive "not found" answer.
//   4. Rate-limit errors are soft — per-SKU failures go to `unreachable`
//      instead of `errors`; the caller tolerates the run.
export async function buildFullCatalogSnapshot(
  opts: {
    chunkSize?: number;
    chunkDelayMs?: number;
  } = {},
): Promise<{
  snapshot: Map<string, number | null>;
  errors: Array<{ sku: string; message: string }>;
  unreachable: Array<{ sku: string; message: string }>;
}> {
  const chunkSize = opts.chunkSize ?? 5;
  const chunkDelayMs = opts.chunkDelayMs ?? 1200;

  const variants = await prisma.$queryRaw<{ sku: string }[]>`
    SELECT v.sku
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    WHERE p.active = true
    ORDER BY v.sku ASC
  `;
  const wantedSkus = new Set(variants.map((v) => v.sku));

  const snapshot = new Map<string, number | null>();
  const errors: Array<{ sku: string; message: string }> = [];
  const unreachable: Array<{ sku: string; message: string }> = [];

  // ---- Phase 1: bulk paginate → SKU→id map -----------------------------
  const skuToId = new Map<string, string>();
  try {
    let totalPages = 1;
    for (let page = 1; page <= 50; page++) {
      const result = await withRetry(() => tinyListProductsPage(page));
      totalPages = result.totalPages || totalPages;
      for (const item of result.items) {
        if (wantedSkus.has(item.codigo)) {
          skuToId.set(item.codigo, item.id);
        }
      }
      if (page >= totalPages) break;
      // 1 req/s is comfortably under 60/min.
      await new Promise((r) => setTimeout(r, 1100));
    }
  } catch (err) {
    const msg =
      err instanceof TinyError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    if (/API Bloqueada|Excedido.*acessos/i.test(msg)) {
      // Bulk got rate-limited mid-sweep — what we already pulled stays;
      // SKUs still in `wantedSkus` without an id fall through to the
      // legacy per-SKU path below.
      unreachable.push({ sku: "(bulk)", message: msg });
    } else {
      return {
        snapshot,
        errors: [{ sku: "(bulk)", message: msg }],
        unreachable,
      };
    }
  }

  // ---- Phase 2: fetch stock by id for mapped SKUs ----------------------
  // One HTTP hit per SKU (vs two under the legacy path).
  const mappedSkus = [...skuToId.keys()];
  for (let i = 0; i < mappedSkus.length; i += chunkSize) {
    const chunk = mappedSkus.slice(i, i + chunkSize);
    for (const sku of chunk) {
      const id = skuToId.get(sku)!;
      try {
        const stock = await withRetry(() => tinyGetStockByProductId(id));
        snapshot.set(sku, stock);
      } catch (err) {
        const msg =
          err instanceof TinyError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        if (/API Bloqueada|Excedido.*acessos/i.test(msg)) {
          unreachable.push({ sku, message: msg });
        } else {
          errors.push({ sku, message: msg });
        }
      }
    }
    if (i + chunkSize < mappedSkus.length) {
      await new Promise((r) => setTimeout(r, chunkDelayMs));
    }
  }

  // ---- Phase 3: legacy fallback for SKUs Tiny's bulk list didn't know --
  // These are truly "not in Tiny" candidates. The legacy lookup confirms
  // with its own pesquisa + obter loop (2 hits each); most return null.
  const missingFromBulk = variants
    .filter((v) => !skuToId.has(v.sku) && !snapshot.has(v.sku))
    .map((v) => v.sku);

  for (let i = 0; i < missingFromBulk.length; i += chunkSize) {
    const chunk = missingFromBulk.slice(i, i + chunkSize);
    for (const sku of chunk) {
      try {
        const stock = await tinyGetStockBySku(sku);
        snapshot.set(sku, stock);
      } catch (err) {
        const msg =
          err instanceof TinyError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        if (/API Bloqueada|Excedido.*acessos/i.test(msg)) {
          unreachable.push({ sku, message: msg });
        } else {
          errors.push({ sku, message: msg });
        }
      }
    }
    if (i + chunkSize < missingFromBulk.length) {
      await new Promise((r) => setTimeout(r, chunkDelayMs));
    }
  }

  return { snapshot, errors, unreachable };
}

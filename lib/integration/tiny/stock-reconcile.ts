import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { StockSyncSource } from "@/lib/generated/prisma/enums";
import { getSetting } from "@/lib/settings";

export type Input = {
  source: StockSyncSource;
  // SKU → current Tiny stock value. `null` means "Tiny explicitly has no
  // such SKU". SKUs NOT present in the map are either left alone
  // (`authoritative: false`) or treated as 0 (`authoritative: true`).
  snapshot: Map<string, number | null>;
  authoritative: boolean;
  // SKUs the caller knows were unreachable during the fetch (e.g. Tiny
  // rate-limit). Their local stock is preserved — we skip them for this
  // run and they'll re-check on the next one.
  unreachableSkus?: Set<string>;
  runId?: string | null;
  dryRun?: boolean;
};

export type Outcome =
  | {
      ok: true;
      dryRun: boolean;
      processed: number;
      changed: number;
      zeroed: number;
      unchanged: number;
      // Variant-era safety: when NO variant of a product resolved in Tiny
      // (every snapshot entry was null), we assume the admin hasn't yet
      // registered the variants in Tiny and we preserve local stock. The
      // count surfaces in IntegrationRun so the admin knows to register.
      skippedProductsNotInTiny: number;
      skippedProducts: Array<{ productId: string; slug: string; variants: string[] }>;
      diffs: Array<{ sku: string; from: number; to: number }>;
    }
  | {
      ok: false;
      reason: "safety_threshold";
      proposedZeros: number;
      totalActive: number;
      thresholdPct: number;
    }
  | { ok: false; reason: "no_active_variants" };

type ActiveVariant = {
  id: string;
  sku: string;
  stock: number;
  productId: string;
  productSlug: string;
};

function proposeStock(
  currentStock: number,
  snapshotValue: number | null | undefined,
  authoritative: boolean,
): number {
  // snapshot has an entry for this SKU
  if (snapshotValue !== undefined) return snapshotValue ?? 0;
  // SKU absent from snapshot
  return authoritative ? 0 : currentStock;
}

export async function reconcileStockFromTiny(input: Input): Promise<Outcome> {
  const active = await prisma.$queryRaw<ActiveVariant[]>`
    SELECT v.id, v.sku, v.stock, v."productId" AS "productId", p.slug AS "productSlug"
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    WHERE p.active = true
  `;
  if (active.length === 0) return { ok: false, reason: "no_active_variants" };

  // ---- Variant-era safety: products where NO variant was found in Tiny
  // should not be zeroed out; they're simply not registered in Tiny yet.
  // This check only engages on authoritative runs — webhook deltas don't
  // imply "we asked for it and Tiny said no," so skipping is moot there.
  const productHasAnyMatch = new Map<string, boolean>();
  const productSlugs = new Map<string, string>();
  const productVariants = new Map<string, string[]>();
  for (const v of active) {
    productSlugs.set(v.productId, v.productSlug);
    const bucket = productVariants.get(v.productId) ?? [];
    bucket.push(v.sku);
    productVariants.set(v.productId, bucket);

    const snap = input.snapshot.get(v.sku);
    const hasMatch = typeof snap === "number";
    if (hasMatch) productHasAnyMatch.set(v.productId, true);
    else if (!productHasAnyMatch.has(v.productId)) productHasAnyMatch.set(v.productId, false);
  }

  const skippedProductIds = new Set<string>();
  if (input.authoritative) {
    for (const [productId, anyMatch] of productHasAnyMatch) {
      if (!anyMatch) skippedProductIds.add(productId);
    }
  }

  const diffs: Array<{ sku: string; from: number; to: number; variantId: string }> = [];
  let proposedZeros = 0;
  const unreachable = input.unreachableSkus ?? new Set<string>();
  for (const v of active) {
    if (skippedProductIds.has(v.productId)) continue;
    // Preserve stock for SKUs that were unreachable this run (rate-limit
    // etc.). They'll re-check on the next run when Tiny's window resets.
    if (unreachable.has(v.sku)) continue;
    const proposed = proposeStock(v.stock, input.snapshot.get(v.sku), input.authoritative);
    if (proposed !== v.stock) {
      diffs.push({ sku: v.sku, from: v.stock, to: proposed, variantId: v.id });
      if (v.stock > 0 && proposed === 0) proposedZeros++;
    }
  }

  // Safety guard still engages — catches "Tiny returned 0 for everything"
  // pathological cases. Skipped (not-in-Tiny) products are excluded from
  // the denominator so a single-product catalog with no Tiny records
  // doesn't trip the threshold permanently.
  const threshold = (await getSetting("stock.tinySyncSafetyThresholdPct")).pct;
  const consideredActive = active.length - [...skippedProductIds].reduce((n, pid) => {
    return n + (productVariants.get(pid)?.length ?? 0);
  }, 0);
  const pctZeroed = consideredActive > 0 ? (proposedZeros / consideredActive) * 100 : 0;
  if (proposedZeros > 0 && pctZeroed > threshold) {
    return {
      ok: false,
      reason: "safety_threshold",
      proposedZeros,
      totalActive: consideredActive,
      thresholdPct: threshold,
    };
  }

  const skippedProducts = [...skippedProductIds].map((pid) => ({
    productId: pid,
    slug: productSlugs.get(pid) ?? "",
    variants: productVariants.get(pid) ?? [],
  }));

  if (input.dryRun) {
    return {
      ok: true,
      dryRun: true,
      processed: active.length,
      changed: diffs.length,
      zeroed: proposedZeros,
      unchanged: active.length - diffs.length - skippedProducts.reduce((n, p) => n + p.variants.length, 0),
      skippedProductsNotInTiny: skippedProducts.length,
      skippedProducts,
      diffs: diffs.map(({ sku, from, to }) => ({ sku, from, to })),
    };
  }

  if (diffs.length > 0) {
    await prisma.$transaction(
      diffs.flatMap(({ variantId, sku, from, to }) => [
        prisma.variant.update({
          where: { id: variantId },
          data: { stock: to },
        }),
        prisma.stockSyncEvent.create({
          data: {
            sku,
            variantId,
            oldStock: from,
            newStock: to,
            source: input.source,
            integrationRunId: input.runId ?? null,
          },
        }),
      ]),
    );
  }

  return {
    ok: true,
    dryRun: false,
    processed: active.length,
    changed: diffs.length,
    zeroed: proposedZeros,
    unchanged: active.length - diffs.length - skippedProducts.reduce((n, p) => n + p.variants.length, 0),
    skippedProductsNotInTiny: skippedProducts.length,
    skippedProducts,
    diffs: diffs.map(({ sku, from, to }) => ({ sku, from, to })),
  };
}

// Helper: format an Outcome as a short line for logs / admin UI.
export function summarize(o: Outcome): string {
  if (!o.ok) {
    if (o.reason === "safety_threshold") {
      return `aborted: would zero ${o.proposedZeros}/${o.totalActive} (>${o.thresholdPct}%)`;
    }
    return `aborted: ${o.reason}`;
  }
  const skippedNote =
    o.skippedProductsNotInTiny > 0
      ? ` · skipped ${o.skippedProductsNotInTiny} produto(s) sem match no Tiny`
      : "";
  return `${o.dryRun ? "(dry) " : ""}processed=${o.processed} changed=${o.changed} zeroed=${o.zeroed}${skippedNote}`;
}

// Prisma.InputJsonValue-typed payload for IntegrationRun.
export function outcomeAsPayload(o: Outcome): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(o)) as Prisma.InputJsonValue;
}

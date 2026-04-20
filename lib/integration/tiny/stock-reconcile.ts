import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { StockSyncSource } from "@/lib/generated/prisma/enums";
import { getSetting } from "@/lib/settings";

export type Input = {
  source: StockSyncSource;
  // SKU → current Tiny stock value. `null` means "Tiny explicitly has no
  // such SKU" (reconciler treats as 0 when authoritative). SKUs NOT present
  // in the map are either left alone (`authoritative: false`) or treated as
  // 0 (`authoritative: true`).
  snapshot: Map<string, number | null>;
  authoritative: boolean;
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

type ActiveVariant = { id: string; sku: string; stock: number };

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
    SELECT v.id, v.sku, v.stock
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    WHERE p.active = true
  `;
  if (active.length === 0) return { ok: false, reason: "no_active_variants" };

  const diffs: Array<{ sku: string; from: number; to: number; variantId: string }> = [];
  let proposedZeros = 0;
  for (const v of active) {
    const proposed = proposeStock(v.stock, input.snapshot.get(v.sku), input.authoritative);
    if (proposed !== v.stock) {
      diffs.push({ sku: v.sku, from: v.stock, to: proposed, variantId: v.id });
      if (v.stock > 0 && proposed === 0) proposedZeros++;
    }
  }

  // Safety guard only engages on authoritative runs — a partial webhook
  // delta wouldn't usually breach threshold, but we still check to block a
  // Tiny "mass-zero" event.
  const threshold = (await getSetting("stock.tinySyncSafetyThresholdPct")).pct;
  const pctZeroed = (proposedZeros / active.length) * 100;
  if (proposedZeros > 0 && pctZeroed > threshold) {
    return {
      ok: false,
      reason: "safety_threshold",
      proposedZeros,
      totalActive: active.length,
      thresholdPct: threshold,
    };
  }

  if (input.dryRun) {
    return {
      ok: true,
      dryRun: true,
      processed: active.length,
      changed: diffs.length,
      zeroed: proposedZeros,
      unchanged: active.length - diffs.length,
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
    unchanged: active.length - diffs.length,
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
  return `${o.dryRun ? "(dry) " : ""}processed=${o.processed} changed=${o.changed} zeroed=${o.zeroed}`;
}

// Prisma.InputJsonValue-typed payload for IntegrationRun.
export function outcomeAsPayload(o: Outcome): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(o)) as Prisma.InputJsonValue;
}

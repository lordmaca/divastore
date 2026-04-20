// PM2 cron (every 30 min) + manual target for `./scripts/bdd sync-stock`.
// Fetches the full Tiny stock map for the active catalog and runs the
// reconciler in authoritative mode. Exits 1 on any abort so PM2 surfaces it.
//
// Flags:
//   --dry        compute plan, print, do NOT apply, exit 0
//   --source=X   override the recorded source (CLI | ADMIN_MANUAL | TINY_CRON)

import { prisma } from "../lib/db";
import { StockSyncSource } from "../lib/generated/prisma/enums";
import { buildFullCatalogSnapshot } from "../lib/integration/tiny/stock-fetch";
import {
  reconcileStockFromTiny,
  summarize,
  outcomeAsPayload,
} from "../lib/integration/tiny/stock-reconcile";

function parseArgs() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry") || args.includes("--dry-run");
  const sourceArg = args.find((a) => a.startsWith("--source="))?.split("=")[1];
  const source: StockSyncSource =
    sourceArg === "CLI"
      ? StockSyncSource.CLI
      : sourceArg === "ADMIN_MANUAL"
        ? StockSyncSource.ADMIN_MANUAL
        : StockSyncSource.TINY_CRON;
  return { dry, source };
}

async function main() {
  const { dry, source } = parseArgs();
  const startedAt = Date.now();

  // Create the IntegrationRun up front so /admin/integrations/runs shows
  // an in-progress marker even if the sync crashes mid-sweep.
  const run = await prisma.integrationRun.create({
    data: {
      adapter: "tiny",
      operation: dry ? "stock.reconcile.dry" : "stock.reconcile",
      status: "running",
      payload: { source, startedAt: new Date(startedAt).toISOString() },
    },
  });

  try {
    const { snapshot, errors } = await buildFullCatalogSnapshot();
    if (errors.length > 0) {
      // We can't safely run authoritative if any SKU was unreachable —
      // "missing from Tiny" would be indistinguishable from "Tiny
      // unavailable," and the storefront could be wiped.
      await prisma.integrationRun.update({
        where: { id: run.id },
        data: {
          status: "error",
          durationMs: Date.now() - startedAt,
          error: `Unable to reach Tiny for ${errors.length} SKUs — refusing authoritative run`,
          payload: {
            source,
            errors: errors.slice(0, 20),
            errorCount: errors.length,
          },
        },
      });
      console.error(`[tiny-stock] ${errors.length} SKU lookups failed — aborting`);
      process.exit(1);
    }

    const outcome = await reconcileStockFromTiny({
      source,
      snapshot,
      authoritative: true,
      runId: run.id,
      dryRun: dry,
    });

    const status =
      !outcome.ok
        ? outcome.reason === "safety_threshold"
          ? "aborted_safety"
          : "aborted"
        : dry
          ? "dry_ok"
          : "ok";

    await prisma.integrationRun.update({
      where: { id: run.id },
      data: {
        status,
        durationMs: Date.now() - startedAt,
        payload: outcomeAsPayload(outcome),
        error: !outcome.ok ? summarize(outcome) : null,
      },
    });

    console.log(`[tiny-stock] ${summarize(outcome)}`);
    await prisma.$disconnect();
    process.exit(outcome.ok ? 0 : 1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: msg.slice(0, 500),
      },
    });
    console.error("[tiny-stock] fatal:", msg);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();

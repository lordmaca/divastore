# Tiny ERP integration

Tiny is the authoritative source of truth for inventory and order fulfillment. This doc covers both directions of the integration.

## Order out (existing)

When a customer pays and `mercadopago` webhook flips the order to `PAID`, [`lib/integration/publish-order.ts`](../lib/integration/publish-order.ts) pushes the order to Tiny via `pedido.incluir.php`. Idempotent on `Order.tinyOrderId`; admin can retry/republish from `/admin/integrations`.

## Stock in (new)

Tiny's stock per SKU flows back to the storefront through a **cron + webhook + manual** architecture. All three paths funnel through the same reconciler, so behavior stays consistent.

```
   ┌──────────────────────────────────┐
   │  Tiny ERP (authoritative stock)  │
   └─────┬────────────────────────────┘
         │                    │
   (pull every 30m)      (push on change)
         ▼                    ▼
   cron script         /api/webhooks/tiny
         │                    │
         └─────────┬──────────┘
                   ▼
   lib/integration/tiny/stock-reconcile.ts
     • load active Variants
     • overlay snapshot
     • ABORT if >threshold% would zero
     • apply in transaction
     • write StockSyncEvent + IntegrationRun
```

### Pull: 30-minute cron

PM2 app `brilhodediva-tiny-stock-sync`. Entry point: [`scripts/sync-tiny-stock.ts`](../scripts/sync-tiny-stock.ts).

For every active `Variant` (`Product.active = true`), it:

1. Calls `tinyGetStockBySku(sku)` — two hops under the hood: search by SKU → get stock by Tiny id.
2. Builds a `Map<sku, number | null>` where `null` means "Tiny explicitly has no such SKU."
3. If ANY SKU lookup errored (network, 5xx, auth), the run **aborts without writing** — we can't distinguish "missing" from "unreachable" and wiping inventory on a transient Tiny hiccup would be devastating.
4. Hands the map to the reconciler in **authoritative** mode.

### Push: webhook (ready, not yet active)

Endpoint: `POST /api/webhooks/tiny`. Gated on `TINY_WEBHOOK_SECRET` (HMAC-SHA256 of raw body, `x-tiny-signature` header, hex or base64). Any request without a valid signature returns 401 — setup without the secret means the endpoint rejects everything (safe default).

Payload shape expected:
```json
{
  "event": "estoque.atualizado",
  "dados": [
    { "sku": "COL-LAC-ROSE", "saldo": 3 },
    { "sku": "ANE-ESTR", "saldo": 0 }
  ]
}
```

Handler runs the reconciler in **non-authoritative** mode (SKUs absent from the payload keep their current stock). The 30% safety threshold still applies to whatever is in the delta.

Tiny v2 doesn't push stock webhooks natively — this endpoint is ready for Tiny v3 eventos or any middleware that forwards change notifications.

### Manual: admin button + CLI

- **Admin**: `/admin/integrations` → Tiny card → "Sincronizar agora" (or "Simular" for dry-run). Runs authoritatively, tags the trail with `source=ADMIN_MANUAL`.
- **CLI**: `./scripts/bdd sync-stock` (or `sync-stock --dry`).

## Variant SKUs — matching requirement

Every `Variant.sku` on the storefront must exist as its own product in Tiny. The sync iterates per variant; it does NOT walk a parent→children relationship (Tiny v2's "grade" feature is not used).

Typical SKU shapes the storefront receives from DivaHub:

- `DIVA-000042-T15` / `DIVA-000042-T18` / `DIVA-000042-TREG` — ring sizes
- `DIVA-000042-MDOURADO` / `DIVA-000042-MPRATEADO` / `DIVA-000042-MROSEGOLD` — materials

Each of these needs a matching product in Tiny with `codigo = <SKU>`.

**Safety:** if NO variant of a product resolves in Tiny (every lookup returned "not found"), the reconciler treats the product as "not tracked by Tiny yet" and **preserves** the local stock. `skippedProductsNotInTiny` in the `IntegrationRun.payload` surfaces how many products are in that state. Fix by either:

1. Registering each variant SKU as a Tiny product, OR
2. Unchecking the product's `active` flag on the storefront until the Tiny side is in sync.

## Safety guard (mass-zero protection)

[`SettingsKv`](../lib/settings.ts) key `stock.tinySyncSafetyThresholdPct` (default `30`). If an **authoritative** run proposes to zero more than this percentage of the *matched* catalog in a single execution (products skipped for "not in Tiny" are excluded from the denominator), it aborts and writes `IntegrationRun(status="safety_threshold")`. Zero row written.

This protects against:

- Tiny returning partial/stale data during an incident.
- A misconfigured token that reads an empty product list.
- A misaligned catalog (e.g. SKUs changed in Tiny but not updated on the storefront).

Tune the threshold down during early operation (say 10%) if your SKU count is small and catastrophic zeroing is unlikely to be legitimate. Tune up (50%+) if you run big seasonal rotations.

## Audit trail

- `IntegrationRun` — one row per sync run. Visible at `/admin/integrations/runs` with filter `adapter=tiny`. Operation values:
  - `stock.reconcile` — the cron/admin/cli authoritative run
  - `stock.reconcile.dry` — dry run, nothing applied
  - `stock.webhook` — an incoming webhook reconcile
- `StockSyncEvent` — one row per *change*. Shows old/new/source. Query with `./scripts/bdd stock-events [N]`.

## Env vars

```
TINY_API_TOKEN         # existing — used for all Tiny calls
TINY_API_BASE_URL      # existing — defaults to Tiny v2 base
TINY_WEBHOOK_SECRET    # NEW — empty until Tiny is configured to push
```

## Racing concerns

- **Cron + webhook concurrent**: each variant update is an atomic SET. Last write wins. Both sources are Tiny → converges fine.
- **Order publish → Tiny stock drift**: when an order is published to Tiny, Tiny decrements its own stock. Our next sync picks it up. Expect up to ~30 min lag between customer purchase and the storefront reflecting the decrement. The storefront never locally decrements on order (no dual-write races).
- **Oversell window**: in the gap between a customer reaching checkout and the next sync, the stock shown on the PDP can be stale by up to 30 min + order publish latency. Acceptable for current volume; revisit if flash-sales appear.

## Operator runbook

```bash
# Inspect current state
./scripts/bdd status
./scripts/bdd stock-events 30

# Dry-run before a large Tiny change on their side
./scripts/bdd sync-stock --dry

# Force a real sync (e.g. right after a Tiny bulk edit)
./scripts/bdd sync-stock

# If safety-threshold is blocking a legitimate mass-zero:
#   1. Open /admin/integrations/runs, confirm the abort reason
#   2. /admin/configuracoes → tweak "Sincronização de estoque — limite de segurança (%)"
#   3. Re-run ./scripts/bdd sync-stock
#   4. Restore the threshold afterward

# If Tiny goes down mid-sync:
#   scripts/bdd logs brilhodediva-tiny-stock-sync
#   no action needed — next cron will reconcile
```

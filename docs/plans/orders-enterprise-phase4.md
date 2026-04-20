# Orders enterprise overhaul — Phase 4 progress

**Strategic plan:** [orders-enterprise.md](orders-enterprise.md) · **Previous phase:** [phase 3](orders-enterprise-phase3.md)

**Status:** ✅ **SHIPPED** 2026-04-18 · deployed + DivaHub safe.

**Phase goal:** Admin one-click buys a Melhor Envio shipping label. Label PDF + tracking code populate automatically. A signed carrier webhook updates the shipment status in near-real-time, auto-transitions the order to `DELIVERED`, and fires `out_for_delivery` / `delivery_exception` customer emails.

---

## Checklist

### Foundation
- [x] **4.1** Schema: `Shipment` model + `ShipmentStatus` enum + Order back-relation
- [x] **4.2** Migration `20260418023403_add_shipments` applied

### Melhor Envio label client
- [x] **4.3** [lib/integration/shipping/melhorenvio/labels.ts](../../lib/integration/shipping/melhorenvio/labels.ts) — `meAddToCart`, `meCheckout`, `meGenerate`, `mePrintUrl`, `meTracking`, `meDefaultTrackingUrl`. Tolerant of ME's keyed-by-id response shape variants.

### Orchestration
- [x] **4.4** [lib/shipments.ts](../../lib/shipments.ts) `purchaseShippingLabel(orderId)` — cart→checkout→generate→print→tracking pipeline; upserts Shipment; mirrors tracking fields to Order; idempotent (reuses non-CANCELLED Shipment).
- [x] **4.5** `applyShipmentWebhook(...)` shared by the webhook endpoint — upserts Shipment status + emits OrderEvent + fires customer emails + auto-transitions Order.status.

### Webhook
- [x] **4.6** [app/api/webhooks/melhorenvio/route.ts](../../app/api/webhooks/melhorenvio/route.ts) — HMAC-SHA256 signature verification; accepts `{data:...}` and `{orders:[...]}` payload shapes; maps ME statuses to our enum via `STATUS_MAP`; writes `IntegrationRun(adapter=melhorenvio, operation=webhook)`.

### Notifications
- [x] **4.7** Template `out_for_delivery` — "Saiu para entrega hoje" + tracking
- [x] **4.8** Template `delivery_exception` — "Problema na entrega" with carrier message

### Admin UI
- [x] **4.9** [ShippingLabelCard](../../components/admin/ShippingLabelCard.tsx) — status pill, carrier/service/price/ETA/tracking, Comprar etiqueta button, Baixar etiqueta link, auto-messaging on purchase success/failure
- [x] **4.10** Admin detail page now mounts `ShippingLabelCard` above an "Ações manuais" strip (retry-publish + OrderShipControls kept as escape hatches)
- [x] **4.11** `purchaseShippingLabelAction` in [lib/admin-actions.ts](../../lib/admin-actions.ts) — admin-gated wrapper with revalidation

### CLI
- [x] **4.12** `bdd label <orderNumber>` via [scripts/buy-label-cli.ts](../../scripts/buy-label-cli.ts)
- [x] **4.13** `bdd shipments [n]` — last N Shipment rows with tracking

### Env + docs
- [x] **4.14** `MELHORENVIO_WEBHOOK_SECRET` added to README env table; surfaced in `bdd env`
- [x] **4.15** [docs/logistics.md](../logistics.md) — full runbook covering flow, env vars, status mapping, webhook testing, failure modes

### Ship
- [x] **4.16** Typecheck clean first pass; deploy green; DivaHub 307 pre + post; `bdd shipments` smoke returns empty (expected — no labels bought yet)

---

## Notes / decisions

- **Shipment is the new source of truth for post-purchase tracking.** Order.`trackingCode` / `trackingUrl` / `shippingCarrier` stay as a denorm cache populated from the latest Shipment — lets the admin list filter on "has tracking" without a JOIN and keeps the existing customer UI working unchanged.
- **Label purchase is manual** (user decision 2026-04-18) — no auto-purchase on PAID. Operators confirm packaging/dimensions before ME balance is debited.
- **`shipping.origin` extended** with `phone`, `email`, `cnpj`, `complement` — ME's `/me/cart` needs sender contact + document to generate a valid NF-backed label. Existing quoting-only fields stay as-is.
- **Webhook handles status-change only** — if ME re-pushes the same status, we update tracking code but don't re-fire emails or events. Prevents duplicate `out_for_delivery` emails on ME retries.
- **Auto-transition Order → DELIVERED** on carrier webhook. Fires `order_delivered` email once (Notification unique constraint dedupes against manual admin mark-as-delivered). Operator no longer has to babysit the fulfillment state after shipping.
- **Label URL may be null immediately after purchase** — ME takes 2–5 seconds to generate. The admin card shows the Comprar button again on null; refresh after a moment grabs the PDF. No poll cron for v1 (optional enhancement tracked in strategic plan §Phase 4.7).
- **ME tracking URL fallback** — we use `https://www.melhorrastreio.com.br/rastreio/<code>` when ME doesn't return a direct carrier URL. Works for Correios/Jadlog/Loggi uniformly.

---

## What's next

Orders enterprise overhaul is fully delivered across 4 phases:

1. ✅ Foundation: [phase 1](orders-enterprise-phase1.md)
2. ✅ NF-e invoices: [phase 2](orders-enterprise-phase2.md)
3. ✅ Refunds: [phase 3](orders-enterprise-phase3.md)
4. ✅ Logistics labels + webhooks: this file

Optional follow-ups not scoped here:
- Shipment-reconcile cron (hourly fallback when ME webhooks miss)
- NOTE_ADDED event type — wire up an admin internal-notes textarea on the detail page
- `/api/admin/exports/orders-enterprise.csv` — OrderEvent-aware export including invoice, refund, and shipment timelines
- Bulk actions on the admin list (multi-select → "buy labels for all", "mark shipped", etc.)

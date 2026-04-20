# Orders enterprise overhaul — Phase 1 progress

**Strategic plan:** [orders-enterprise.md](orders-enterprise.md)

**Status:** ✅ **SHIPPED** 2026-04-18 · deployed + DivaHub safe · backfill run.

**Phase goal:** admins can open any order and see everything. Every lifecycle transition emits an OrderEvent. Payment metadata is fully extracted from MP into typed columns. Customers get a Pix QR / boleto URL on pending orders.

**How to use this file:** each checkbox represents a chunk of work that can be merged on its own. If a session ends mid-phase, the next session resumes from the first unchecked box. Update this file as you complete each item — single source of truth for "where we are."

---

## Checklist

### Foundation

- [x] **1.1** Extend Prisma schema: `OrderEvent` model, `OrderEventType` enum, Payment column additions, Order denormalization columns (`lastPaymentMethod`, `lastPaymentStatus`)
- [x] **1.2** Apply migration `20260418014547_add_order_events_and_payment_details`
- [x] **1.3** `recordOrderEvent(orderId, type, opts)` helper + `ORDER_EVENT_LABEL` map in [lib/orders.ts](../../lib/orders.ts)

### Emission — wire events into every existing transition

- [x] **1.4** Checkout action emits `ORDER_CREATED` and seeds `Order.lastPaymentMethod/Status`
- [x] **1.5** MP webhook: extracts `paymentTypeId`, `installments`, `installmentAmountCents`, `feeCents`, `netReceivedCents`, `refundedCents`, `cardLastFour`, `cardHolderName`, Pix `qrCode`/`qrCodeBase64`/expiry, boleto `url`/`barcode`/expiry; emits `PAYMENT_APPROVED` / `PAYMENT_REJECTED` / `PAYMENT_REFUNDED` / `PAYMENT_CHARGED_BACK` / `PAYMENT_PENDING` with status-change guards; syncs Order denorm cache
- [x] **1.6** `markOrderShipped` emits `SHIPPED` with tracking metadata; `markOrderDelivered` emits `DELIVERED`
- [x] **1.7** Backfill script `scripts/backfill-order-events.ts` — run once, idempotent (skips orders that already have events)

### Query layer

- [x] **1.8** [lib/orders/search.ts](../../lib/orders/search.ts) — `buildOrderWhere`, `searchOrders`, `parseSearchParams` with filters (q, status[], paymentMethod[], paymentStatus[], hasTracking, publishedToTiny, date range) + cursor pagination

### Admin UI

- [x] **1.9** [/admin/pedidos/[orderId]](../../app/admin/pedidos/%5BorderId%5D/page.tsx) — 7 cards: Header (status + total), Cliente (incl. customer-order-count), Itens, Pagamento (per-payment row with fee/liquido/refund/QR peek), Fiscal (stub), Logística (publish + ship controls + Tiny id), Linha do tempo (OrderEvent strip with metadata peek)
- [x] **1.10** [/admin/pedidos](../../app/admin/pedidos/page.tsx) — search box, status/method/tracking/Tiny filter pills, pagination, clickable rows, payment-method + tracking columns

### Customer UI

- [x] **1.11** [components/account/PaymentCard.tsx](../../components/account/PaymentCard.tsx) — method + status + installments + Pix QR image + copy-paste code + expiry countdown + boleto link + refund note. Wired into [customer order detail](../../app/%28account%29/minha-conta/pedidos/%5BorderId%5D/page.tsx).

### Notifications

- [x] **1.12** Template `payment_pending_pix` registered in [lib/notifications/templates/index.ts](../../lib/notifications/templates/index.ts); fired from MP webhook's `PENDING` branch when a Pix QR code is available

### CLI

- [x] **1.13** `bdd order <number>` — prints order row + payment rows + last 20 timeline events
- [x] **1.14** `bdd events <orderId> [n]` — last N OrderEvents
- [x] **1.15** `bdd backfill-events` — runs [scripts/backfill-order-events.ts](../../scripts/backfill-order-events.ts)

### Ship

- [x] **1.16** `./scripts/bdd typecheck` clean; `./scripts/bdd deploy` → build ✓, reload ✓, DivaHub 307 pre + post, storefront /api/health 200
- [x] **1.17** Smoke: `bdd order 1` returns full detail + timeline row; `bdd events <id>` returns rows; `/admin/pedidos` + `/admin/pedidos/[id]` return 307 unauthed (redirect to login — expected); backfill created events for all pre-phase-1 orders

---

## Notes / decisions made during implementation

- **NF-e issuance is Tiny's responsibility, not ours** (user decision 2026-04-18): Phase 2 will call `nota.fiscal.emitir.php` but we never build our own fiscal document. Tiny is the system of record.
- **"Comprar etiqueta" stays manual** (user decision 2026-04-18): Phase 4 will add the button + action, but auto-purchase on PAID is disabled by default.
- **MP webhook event emission is status-change-guarded** — if MP re-sends an already-processed status, we don't re-emit the OrderEvent or re-fire the email. Avoids timeline noise and duplicate notifications (the Notification `@@unique([orderId, template, channel])` already enforces uniqueness, but short-circuiting at emit-time keeps the timeline clean too).
- **Cron scripts need `--env-file=.env.local`** — `node --env-file=.env.local ./node_modules/.bin/tsx scripts/…` is the pattern. Plain `npx tsx` doesn't inherit the env file when PM2 isn't involved. Retroactively fixed `bdd retry`, `bdd abandoned`, `bdd backfill-events`.
- **`Payment.method` no longer defaults to CARD in the webhook** — it's now derived from MP's `payment_type_id` on every upsert. Old rows (pre-phase-1) keep whatever was first written.
- **Admin list denormalization: `Order.lastPaymentMethod` / `lastPaymentStatus`** — kept in sync by both the checkout action (seed on PENDING) and the MP webhook (every status update). Filters use these columns, so no JOIN needed on the hot list query.

---

## What's next

Phase 2 (Tiny NF-e) — see [orders-enterprise.md §Phase 2](orders-enterprise.md#phase-2--nf-e--fiscal-documents-tiny). Key points confirmed for Phase 2 kickoff:
- Auto-issue on payment approval (not admin click) — user decision 2026-04-18
- Tiny is the system of record; we only consume its NF-e endpoints

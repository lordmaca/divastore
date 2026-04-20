# Orders surface — enterprise-grade overhaul

## Context

Today the orders surface was built to prove the flow end-to-end — an order gets created, paid, published to Tiny, and a customer can see status. That's a functional MVP. What's missing for "enterprise" is the entire back-office apparatus:

- **No admin detail page** — admins see a 100-row list; any deep work is improvised via psql.
- **No NF-e (nota fiscal) support** — we publish pedidos to Tiny but never ask Tiny to emit an invoice, so the customer never receives a fiscal document. This is table-stakes for Brazilian e-commerce.
- **Payment data is 95% trapped in `Payment.rawPayload`** — we only extract `amountCents`. Installments, fees, net settlement, refund totals, Pix QR codes, boleto URLs — all present in MP's response, none queryable.
- **No refund action** — the webhook reacts to MP refunds but the operator can't *initiate* one from the admin.
- **Shipping is quoting-only** — Melhor Envio quotes are wired into checkout, but the `/me/cart` → `/me/checkout` → `/me/shipment/generate` label-purchase flow isn't called. Tracking codes are admin-typed by hand.
- **No order timeline** — "what happened when" is scattered across Order.updatedAt + Payment rows + Notification rows + IntegrationRun rows. Nothing stitches it together.
- **Notifications cover the happy path** — `order_created`, `payment_approved`, `order_shipped`, `order_delivered` all fire. `invoice_issued`, `refund_issued`, `out_for_delivery`, `delivery_exception` don't exist.

Fixing this properly is a 4-phase arc. Each phase ships real customer/admin value on its own; nothing after Phase 1 depends on everything before it being finished.

---

## Phase 1 — Foundation: admin detail page + order timeline + richer payment capture

**Goal:** admins can open any order and see *everything*. Ship this first; every later phase plugs into its slots.

### 1.1 New `OrderEvent` model

```prisma
enum OrderEventType {
  ORDER_CREATED
  PAYMENT_PENDING
  PAYMENT_APPROVED
  PAYMENT_REJECTED
  PAYMENT_REFUNDED
  PAYMENT_CHARGED_BACK
  INVOICE_REQUESTED         // Phase 2 — emission triggered
  INVOICE_ISSUED            // Phase 2 — Tiny confirmed NF-e
  INVOICE_FAILED            // Phase 2
  INVOICE_CANCELLED         // Phase 2
  LABEL_PURCHASED           // Phase 4
  SHIPPED
  OUT_FOR_DELIVERY          // Phase 4 — from carrier webhook
  DELIVERY_EXCEPTION        // Phase 4
  DELIVERED
  CANCELLED
  NOTE_ADDED                // admin internal notes
}

model OrderEvent {
  id         String         @id @default(cuid())
  orderId    String
  order      Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type       OrderEventType
  // Who caused the event: "system", "customer", "admin:<userId>", "webhook:mp", "webhook:tiny", etc.
  actor      String         @default("system")
  message    String?        // human-readable line ("Pagamento aprovado via Pix", "NF-e 000123 emitida")
  metadata   Json?          // structured detail (paymentId, invoiceNumber, trackingCode, etc.)
  createdAt  DateTime       @default(now())

  @@index([orderId, createdAt])
  @@index([type, createdAt])
}
```

**Emit everywhere a state transitions:** checkout action, MP webhook, admin ship/deliver, future invoice issuance, future refund action, future shipping webhook. Centralize in a `recordOrderEvent(orderId, type, opts)` helper under `lib/orders.ts`.

**Backfill** a one-shot seed on migration: for every existing Order, insert synthetic events (`ORDER_CREATED` at `Order.createdAt`, `PAYMENT_APPROVED` at `payments[0].updatedAt` if status=APPROVED, `SHIPPED` at updatedAt if status>=SHIPPED). Keeps the timeline non-empty for pre-existing rows.

### 1.2 Richer `Payment` columns

Add extracted columns so admins can filter/search without parsing JSON:

```prisma
model Payment {
  // ... existing fields
  paymentTypeId       String?   // MP: account_money / credit_card / debit_card / ticket / bank_transfer
  installments        Int?      // 1-12 for card
  installmentAmountCents Int?   // per-installment amount for display
  feeCents            Int?      // MP platform fee
  netReceivedCents    Int?      // amountCents - feeCents
  refundedCents       Int       @default(0)
  refundedAt          DateTime?
  cardLastFour        String?
  cardHolderName      String?
  // Pix pending: QR code payload (customers can copy-paste)
  pixQrCode           String?
  pixQrCodeBase64     String?   @db.Text
  pixExpiresAt        DateTime?
  // Boleto pending
  boletoUrl           String?
  boletoBarcode       String?
  boletoExpiresAt     DateTime?

  @@index([paymentTypeId])
}
```

Webhook extractor rewrite in [app/api/webhooks/mercadopago/route.ts](app/api/webhooks/mercadopago/route.ts): pull these from `mpPayment` into typed columns on every status update. `rawPayload` stays for anything we missed.

**Note:** for Pix + Boleto pending state, we also need MP's `point_of_interaction.transaction_data.qr_code` / `transaction_details`. These are populated by MP at preference-creation time and on the first webhook. Ensure checkout persists them (or the webhook does, whichever lands first).

### 1.3 New route: `/admin/pedidos/[orderId]/page.tsx`

One page. Five cards stacked:

1. **Header** — order number, createdAt, current status, customer name + email, action bar (Reembolsar, Emitir NF-e, Comprar etiqueta, Marcar enviado, Cancelar).
2. **Cliente** — name, email, phone, CPF, shipping address, customer order count + LTV (cheap query).
3. **Itens** — table with SKU, name, qty, unit price, line total, plus subtotal/frete/desconto/total.
4. **Pagamento** — method + status pill, installments (`3x R$150,00`), `valor bruto → fee → líquido`, `valor reembolsado` if refunded, card last-4 or Pix QR (collapsible) or boleto URL. One card per Payment row (handles re-attempts).
5. **Fiscal (NF-e)** — Phase 2 slot. Until then: "Integração fiscal em breve" with Emitir button disabled.
6. **Logística** — Phase 4 slot. Until then: show existing `Order.trackingCode`/`trackingUrl` with the inline ship controls already built.
7. **Linha do tempo** — vertical strip of OrderEvent rows. Each row: icon by type, timestamp, message, small JSON-peek toggle for metadata.

Uses the admin-only `requireAdmin` gate from [lib/admin.ts](lib/admin.ts). No pagination — one order per page, full detail.

### 1.4 Admin list improvements — [app/admin/pedidos/page.tsx](app/admin/pedidos/page.tsx)

Upgrade the list:

- **Search** input (customer email / name / order number / SKU).
- **Filter pills** — status (chip set), date range (last 7d / 30d / custom), payment method, has-NFe / missing-NFe (Phase 2), shipped / unshipped.
- **Pagination** — cursor-based on `createdAt` + `id`, 50 per page, URL-driven so admins can share links.
- **New columns** — payment method (denormalized via a lateral `JOIN LATERAL` or a cached `Order.lastPaymentMethod`), NF number (Phase 2), tracking code (Phase 4).
- **Row click** → `/admin/pedidos/[orderId]` (new detail page).

The list page becomes a thin wrapper over a new `lib/orders/search.ts` that centralizes the query logic so the CSV export (`/api/admin/exports/sales.csv`) can reuse it.

### 1.5 Customer-facing payment card

Add to [app/(account)/minha-conta/pedidos/[orderId]/page.tsx](app/%28account%29/minha-conta/pedidos/%5BorderId%5D/page.tsx):

- When `Payment.status === "PENDING"`:
  - **Pix**: show QR image (base64) + copy-paste code + expiry timer.
  - **Boleto**: show "Baixar boleto" link + barcode + expiry.
- When `APPROVED`: method pill + installments line (`3x R$150,00 sem juros`).
- When `REFUNDED`: "Reembolso de R$X processado em DD/MM/AAAA".

This is the highest-ROI customer-side change — today a Pix buyer who closes the MP tab has no way back to the QR; this fixes it.

### 1.6 Notifications: one new template

- `payment_pending_pix` — sent immediately after checkout when `Payment.status=PENDING && paymentTypeId=pix`. Includes QR code + expiry + link back to the order. Transactional; no opt-in gate.

The equivalent boleto template can come with Phase 2 or stay manual for v1.

### 1.7 `bdd` CLI additions

```
./scripts/bdd order <number>          show order detail (customer+payment+timeline) in terminal
./scripts/bdd events <orderId> [n]    last N OrderEvents for the order
./scripts/bdd backfill-events         one-shot: synthesize events for orders predating OrderEvent
```

---

## Phase 2 — NF-e / Fiscal documents (Tiny)

**Why:** fiscal compliance, legitimacy, customer trust. Every B2C jewelry shop in Brazil issues NF-e.

### 2.1 Schema

```prisma
enum InvoiceStatus {
  REQUESTED   // we called nota.fiscal.emitir.php; waiting for Tiny
  ISSUED      // Tiny returned "emitida"; PDF+XML available
  CANCELLED
  FAILED
}

model Invoice {
  id                 String         @id @default(cuid())
  orderId            String
  order              Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  provider           String         @default("tiny")
  providerInvoiceId  String?        // Tiny's internal NF id
  number             String?        // NF-e numero
  serie              String?        // NF-e série
  accessKey          String?        // chave de acesso (44 digits)
  status             InvoiceStatus  @default(REQUESTED)
  xmlUrl             String?        // Tiny-hosted XML URL
  danfeUrl           String?        // Tiny-hosted DANFE PDF URL
  issuedAt           DateTime?
  cancelledAt        DateTime?
  cancellationReason String?
  rawPayload         Json?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  @@index([orderId])
  @@index([status])
  @@unique([provider, providerInvoiceId])
}
```

### 2.2 Tiny adapter extension — `lib/integration/tiny/invoices.ts`

```ts
tinyEmitirNotaFiscal(tinyOrderId: string): Promise<{ providerInvoiceId: string; status: string }>
tinyObterNotaFiscal(providerInvoiceId: string): Promise<{ number, serie, accessKey, xmlUrl, danfeUrl, status }>
tinyCancelarNotaFiscal(providerInvoiceId: string, motivo: string): Promise<void>
```

Mapped to Tiny v2 endpoints `nota.fiscal.emitir.php`, `nota.fiscal.obter.xml.php`, `nota.fiscal.obter.link.php`, `nota.fiscal.cancelar.php`.

### 2.3 Issuance flow

- Auto-issue on `Order.status` → `PAID` (webhook branch, after `publishOrderToErp`). Gate with a `SettingsKv` flag `invoice.autoIssueOnPaid` (default `true`) so it can be toggled if the team wants to batch.
- Manual issue from the admin detail page "Emitir NF-e" button.
- Both paths call one helper: `issueInvoice(orderId, { reason: 'auto'|'manual' })`.
- Immediately after requesting, we insert `Invoice(status=REQUESTED)` and emit `INVOICE_REQUESTED` OrderEvent.
- A new PM2 cron `brilhodediva-invoice-poll` runs every 5 minutes, picks up `Invoice` rows in `REQUESTED` state older than 60s, calls `tinyObterNotaFiscal` to check status, promotes to `ISSUED` / `FAILED`, emits the matching event, fires `invoice_issued` email.

Rationale for poll vs. inline wait: Tiny can take 10-60s to emit. Blocking the webhook would risk MP retries. Async poll is clean and survives Tiny outages.

### 2.4 Customer-side

- `/minha-conta/pedidos/[orderId]` — "Baixar nota fiscal" button appears when `Invoice.status === ISSUED`. Links to `danfeUrl` (PDF) + secondary link for XML.
- New email template `invoice_issued` with the PDF link.

### 2.5 Admin-side

- Admin detail "Fiscal" card: status pill, number/serie/key, download buttons, "Cancelar NF-e" with required motivo textarea.
- Admin list: new "NF" column showing number or status pill.

### 2.6 `bdd` additions

```
./scripts/bdd invoice <orderId>            manually trigger issuance
./scripts/bdd invoice-status <orderId>     show current Invoice row
./scripts/bdd invoice-poll                 run the poll sweeper once
```

---

## Phase 3 — Refunds (Mercado Pago)

**Why:** operator must be able to refund without a phone call to MP. Today they can only watch MP's webhook tell them a refund happened somewhere else.

### 3.1 MP refund client — [lib/integration/mp/client.ts](lib/integration/mp/client.ts)

Add:

```ts
mercadoPago.refund({
  paymentId: string,       // MP payment id (Payment.providerId)
  amountCents?: number,    // omit for full refund
  reason?: string,         // stored on OrderEvent for the audit trail
  actor: string,           // "admin:<userId>"
}): Promise<{ refundId: string; amountCents: number; status: string }>
```

Implementation: `POST https://api.mercadopago.com/v1/payments/{id}/refunds` with optional `{ amount }` body.

### 3.2 Admin action — [lib/admin-actions.ts](lib/admin-actions.ts)

New `refundPayment(orderId: string, input: { amountCents?: number; reason: string })`:

1. Load the latest APPROVED Payment for the order.
2. Call `mercadoPago.refund(...)`.
3. Update `Payment.refundedCents += amount`, `refundedAt = now()`. If fully refunded, set `status = REFUNDED`.
4. If order was PAID / PACKED, flip `Order.status` to `REFUNDED` (full refund) or leave (partial).
5. Emit `PAYMENT_REFUNDED` OrderEvent with `{ refundId, amountCents, reason, actor }`.
6. Enqueue `refund_issued` email.

### 3.3 Admin UI

Detail-page action bar: "Reembolsar" → opens modal with amount field (default: full remaining) + reason textarea + "Confirmar — essa ação não pode ser desfeita" confirmation checkbox.

### 3.4 Customer-side

Payment card on order detail shows the refunded amount + date. `refund_issued` email template (pt-BR, transactional, no opt-in gate) goes out immediately with the amount + expected settlement timeline ("o valor deve aparecer em até 7 dias úteis no seu método de pagamento").

### 3.5 Partial refund gotcha

MP allows partial refunds. Our `Payment.status` enum treats PARTIAL as still `APPROVED` with `refundedCents > 0`. Only `refundedCents === amountCents` flips to `REFUNDED`. The admin UI must make this explicit: "Pagamento reembolsado parcialmente: R$X de R$Y".

### 3.6 Webhook path stays authoritative

The existing MP webhook that detects `status=refunded` remains — covers cases where the refund is initiated outside our admin (chargeback, direct MP dashboard). The webhook handler unifies with our admin action by upserting the same Payment + emitting the same OrderEvent regardless of who pulled the trigger.

---

## Phase 4 — Logistics: Melhor Envio labels + carrier webhooks

**Why:** today tracking codes are typed in by hand. The operator's real job is "buy the right label, stick it on the box, mark shipped." Let the system buy the label.

### 4.1 Schema

```prisma
enum ShipmentStatus {
  QUOTED            // quote returned at checkout; not purchased yet
  PURCHASED         // label paid via Melhor Envio balance
  PRINTED           // label PDF has been retrieved (and optionally marked as printed)
  POSTED            // carrier picked up (Melhor Envio "enviado")
  IN_TRANSIT
  OUT_FOR_DELIVERY
  DELIVERED
  EXCEPTION         // weather, wrong address, etc.
  RETURNED
  CANCELLED
}

model Shipment {
  id                  String          @id @default(cuid())
  orderId             String
  order               Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  provider            String          @default("melhorenvio")
  providerShipmentId  String?         @unique
  serviceId           String          // chosen ME service (e.g. "PAC 03298")
  carrier             String          // "Correios" / "Jadlog" / etc.
  priceCents          Int
  trackingCode        String?
  trackingUrl         String?
  labelUrl            String?         // PDF from ME
  status              ShipmentStatus  @default(QUOTED)
  purchasedAt         DateTime?
  postedAt            DateTime?
  deliveredAt         DateTime?
  rawPayload          Json?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  @@index([orderId])
  @@index([status])
  @@index([trackingCode])
}
```

Order keeps its `shippingCents`/`shippingCarrier`/`shippingServiceId` columns as a denormalized cache of the **chosen** quote. Shipment becomes the source of truth post-purchase.

### 4.2 Melhor Envio client — `lib/integration/shipping/melhorenvio/labels.ts`

- `addToCart({ orderId, serviceId, from, to, products, dimensions })` → returns ME cart item id
- `checkout(cartItemIds)` → charges ME balance, returns purchase confirmation
- `generate(shipmentId)` → triggers label generation
- `printUrl(shipmentId)` → returns label PDF URL
- `tracking(shipmentId)` → returns tracking code + url

### 4.3 Purchase flow (admin one-click)

Admin detail "Logística" card → "Comprar etiqueta" button:

1. Server action `purchaseShippingLabel(orderId)`.
2. Load Order + shipping address + chosen serviceId.
3. Call `addToCart` → `checkout` → `generate` in sequence.
4. Upsert Shipment row with `providerShipmentId`, `labelUrl`, `status=PURCHASED`.
5. Pull tracking code via `tracking()` — populate `Shipment.trackingCode` + mirror to `Order.trackingCode` (back-compat).
6. Emit `LABEL_PURCHASED` event.
7. Optional: enqueue `shipping_label_ready` internal email to ops (admin-only, not customer — the customer already gets `order_shipped` when the admin confirms it's in the truck).

The current "Marcar como enviado" button stays, but now it's the trigger for the `order_shipped` notification — purchasing the label doesn't alone tell the customer their order is on the move.

### 4.4 Carrier webhook — `/api/webhooks/melhorenvio/route.ts`

Melhor Envio pushes tracking updates. Endpoint gated on `MELHORENVIO_WEBHOOK_SECRET`, same HMAC pattern as the Tiny webhook endpoint.

Handler:

1. Verify signature.
2. Parse payload: `{ shipment_id, status, tracking_code, ... }`.
3. Upsert Shipment by `providerShipmentId`, update `status`, `trackingCode`.
4. Emit matching OrderEvent (`OUT_FOR_DELIVERY`, `DELIVERY_EXCEPTION`, etc.).
5. If status transitions to `DELIVERED` on Shipment, auto-transition `Order.status` → `DELIVERED` (same as `markOrderDelivered` action) + fire `order_delivered` email. Removes manual step.
6. If status = `EXCEPTION`, fire `delivery_exception` email with the reason.

### 4.5 Notifications

New templates:
- `out_for_delivery` — "Seu pedido saiu para entrega hoje"
- `delivery_exception` — "Houve um problema com sua entrega: [motivo]. [Link para contato]"

### 4.6 Customer-side

`/minha-conta/pedidos/[orderId]` already shows tracking code when set. Just point it at `Shipment.trackingUrl` when present (fallback to `Order.trackingUrl`). No UI change visible to the customer.

### 4.7 `bdd` additions

```
./scripts/bdd label <orderId>            purchase shipping label via Melhor Envio
./scripts/bdd shipments [n]              last N shipments across orders
```

---

## Cross-cutting

### Denormalization for the admin list

To avoid a slow list query:

- Add `Order.lastPaymentMethod`, `Order.lastPaymentStatus`, `Order.hasIssuedInvoice` (bool). Populate in the MP webhook / Invoice-poll cron / admin actions. It's cheap to keep in sync and keeps the list query to a single table.

### `OrderEvent` as the audit-trail nervous system

Once Phase 1 lands, any later change that touches Order state MUST emit an event. This becomes our single source of truth for history and unlocks:
- admin CSV export with event-level detail
- future customer-facing "timeline" on the public order page
- compliance/audit reports

### Settings (`SettingsKv`)

Add:
- `invoice.autoIssueOnPaid: { enabled: boolean }` (default `true`)
- `invoice.pollIntervalMs: { ms: number }` (default 60000, guard against hammering Tiny)
- `shipping.autoLabelOnPaid: { enabled: boolean }` (default `false`; risk: buys labels before admin has picked)

### Env vars

- `MELHORENVIO_WEBHOOK_SECRET` — Phase 4
- Tiny already configured; no new env for Phase 2

### `ecosystem.config.js` additions

- `brilhodediva-invoice-poll` (Phase 2, every 5 min)
- Optionally `brilhodediva-shipment-reconcile` (Phase 4, every hour) — fallback poller for Shipments in non-terminal states when the webhook is missing.

---

## File inventory (complete)

### Phase 1
| File | Action |
|---|---|
| [prisma/schema.prisma](../../prisma/schema.prisma) | +OrderEvent model, +Payment columns |
| **new** `lib/orders.ts` (extend existing) | `recordOrderEvent()` helper |
| **new** `lib/orders/search.ts` | shared list/filter/paginate query |
| **new** `app/admin/pedidos/[orderId]/page.tsx` | full admin detail |
| [app/admin/pedidos/page.tsx](../../app/admin/pedidos/page.tsx) | search + filters + pagination + new columns |
| [app/api/webhooks/mercadopago/route.ts](../../app/api/webhooks/mercadopago/route.ts) | extract typed payment columns, emit OrderEvents |
| [app/(shop)/checkout/actions.ts](../../app/%28shop%29/checkout/actions.ts) | emit `ORDER_CREATED` event; persist Pix QR / boleto URL from preference when available |
| [app/(account)/minha-conta/pedidos/[orderId]/page.tsx](../../app/%28account%29/minha-conta/pedidos/%5BorderId%5D/page.tsx) | payment card w/ QR / boleto / installments |
| **new** `lib/notifications/templates/payment_pending_pix.ts` | template |
| [lib/notifications/templates/index.ts](../../lib/notifications/templates/index.ts) | register template |
| [lib/admin-actions.ts](../../lib/admin-actions.ts) | markOrderShipped / markOrderDelivered emit OrderEvents |
| [scripts/bdd](../../scripts/bdd) | +order, +events, +backfill-events |

### Phase 2
| File | Action |
|---|---|
| [prisma/schema.prisma](../../prisma/schema.prisma) | +Invoice model, +InvoiceStatus enum |
| **new** `lib/integration/tiny/invoices.ts` | emit / obter / cancelar |
| **new** `lib/invoices.ts` | `issueInvoice()` orchestrator |
| **new** `scripts/poll-invoices.ts` + ecosystem entry | poll sweeper |
| [app/api/webhooks/mercadopago/route.ts](../../app/api/webhooks/mercadopago/route.ts) | auto-issue on PAID gated by setting |
| **new** `lib/notifications/templates/invoice_issued.ts` | template |
| [lib/admin-actions.ts](../../lib/admin-actions.ts) | +issueInvoice, +cancelInvoice |
| **new** Invoice card in admin detail page + customer detail page | UI |
| [scripts/bdd](../../scripts/bdd) | +invoice, +invoice-status, +invoice-poll |

### Phase 3
| File | Action |
|---|---|
| [lib/integration/mp/client.ts](../../lib/integration/mp/client.ts) | +refund |
| [lib/admin-actions.ts](../../lib/admin-actions.ts) | +refundPayment |
| **new** Refund modal component | UI on admin detail |
| **new** `lib/notifications/templates/refund_issued.ts` | template |
| [lib/notifications/templates/index.ts](../../lib/notifications/templates/index.ts) | register |

### Phase 4
| File | Action |
|---|---|
| [prisma/schema.prisma](../../prisma/schema.prisma) | +Shipment model, +ShipmentStatus enum |
| **new** `lib/integration/shipping/melhorenvio/labels.ts` | cart→checkout→generate client |
| **new** `lib/shipments.ts` | `purchaseShippingLabel()` orchestrator |
| **new** `app/api/webhooks/melhorenvio/route.ts` | signed webhook |
| **new** `lib/notifications/templates/out_for_delivery.ts` + `delivery_exception.ts` | templates |
| [lib/admin-actions.ts](../../lib/admin-actions.ts) | +purchaseShippingLabel |
| **new** Shipment card in admin detail + customer detail | UI |
| [ecosystem.config.js](../../ecosystem.config.js) | +shipment-reconcile cron (optional) |
| [scripts/bdd](../../scripts/bdd) | +label, +shipments |

---

## Verification plan (per phase)

**Phase 1:** seed an order, walk every lifecycle transition (create → approve → ship → deliver), confirm OrderEvent rows appear for each; confirm admin list renders new columns; confirm admin detail page shows all 7 cards; confirm Pix QR card renders for pending Pix orders.

**Phase 2:** MP sandbox order → webhook fires → `invoice.autoIssueOnPaid=true` triggers emission → poll cron picks up REQUESTED → after ~30s Tiny returns ISSUED → customer receives `invoice_issued` email with a downloadable PDF. Admin can also cancel NF-e from the detail page.

**Phase 3:** MP sandbox refund on an approved payment → admin confirms modal → MP returns refund id → Payment.refundedCents increments → Order moves to REFUNDED if full → customer receives `refund_issued` email. Chargeback via MP dashboard triggers the same path via webhook.

**Phase 4:** sandbox Melhor Envio account → admin "Comprar etiqueta" → label PDF downloads → tracking code populates → simulate ME tracking webhook for `out_for_delivery` → customer email fires → final `delivered` webhook → Order flips to DELIVERED and `order_delivered` email fires. No manual admin step needed post-label.

Each phase ends with `./scripts/bdd deploy` (the existing Safe Harbor guard) and `curl -I https://divahub.brilhodediva.com.br` = 307.

# Brilho de Diva — Delivery Hub (shipping integration)

## Context

Today checkout hard-codes `shippingCents: 0` ([app/(shop)/checkout/page.tsx:105](../../app/(shop)/checkout/page.tsx)). Customers never see carrier options, we never buy labels, we never track anything, and Tiny gets `valor_frete: 0` ([lib/integration/tiny/mapper.ts:42](../../lib/integration/tiny/mapper.ts)). The only shipping-shaped thing in the code is a `Variant.weightG Int?` column and a `shipping.freeThresholdCents` setting.

This plan turns shipping into a real feature: **quote at checkout → buy label on paid → track through delivery**, with a single hub abstraction so we can swap or add carriers later.

**Best hub for the Brazilian SMB market: [Melhor Envio](https://melhorenvio.com.br).** Single OAuth2 API aggregates Correios (PAC, SEDEX, Mini Envios), Jadlog, Azul Cargo, Latam Cargo, Loggi, Kangu, J&T. Has sandbox. Per-label fee; no monthly commitment. 80%+ of similar BR DTC shops use it. Frenet/SuperFrete/Intelipost fit different shapes (enterprise, freight, pooled Correios) — noted for later if we need a secondary adapter.

**Decisions confirmed:**
1. Primary hub: **Melhor Envio**.
2. Label ownership: **storefront buys** via the hub from the MP webhook; label PDF stored in private bucket; tracking code + carrier forwarded to Tiny when the order is published.
3. Environment: **sandbox first**, flip a flag to go production.

**Still need from you** (not blocking the plan — blocks implementation):
- **Warehouse origin**: CEP, street+number, district, city/UF. Rate calc is impossible without it.
- **Melhor Envio sandbox credentials**: `CLIENT_ID`, `CLIENT_SECRET` from your Melhor Envio app (Menu → Configurações → API → Minhas aplicações → Criar aplicação, callback `https://loja.brilhodediva.com.br/api/shipping/melhorenvio/oauth/callback`).

---

## Architecture

```
Checkout (CEP) ─► POST /api/shipping/quote ─► Melhor Envio /me/shipment/calculate ─► options[]
      │                                                                                │
      └─── customer picks option ──────────────────────────────────────────────────────┘
                                   │
             placeOrder → Order{shippingCents, shippingServiceId} → MP preference
                                   │
                                   ▼
               MP webhook (APPROVED) ─► buyLabelForOrder(orderId) ─► Melhor Envio
                                              │ /cart + /checkout + /generate
                                              │ /print returns PDF bytes
                                              │
                                              ▼
                      store label in brilhodediva-private/shipping/labels/<orderId>.pdf
                      set Order.trackingCode + shippingCarrier + shippingBoughtAt
                      forward tracking to Tiny via publishOrderToErp

                      [6h cron] ─► pollShipmentStatuses ─► ShipmentEvent rows
                      /api/webhooks/melhorenvio (signed) ─► same pipeline
```

A new `ShippingProvider` interface in `lib/integration/types.ts` (next to `OrderSink`, `PaymentProvider`). Melhor Envio is the first implementation. Registry + IntegrationRun logging piggyback on the existing pattern (`lib/integration/registry.ts`, `lib/integration/publish-order.ts`).

---

## Phase S1 — Quote at checkout (smallest customer-visible slice)

### S1.1 Schema

```
model Variant {
  // existing
  widthCm  Int?
  heightCm Int?
  lengthCm Int?
}

model Order {
  // existing
  shippingCarrier   String?    // "correios-pac", "jadlog-com", …
  shippingServiceId String?    // Melhor Envio numeric id ("1","2","3",…)
  shippingEtaDays   Int?
}
```

Variant dimensions default to a "jewelry box preset" from `SettingsKv` when the variant row doesn't have them — avoids forcing DivaHub to re-publish with dimensions on day one.

### S1.2 Adapter

- `lib/integration/shipping/types.ts` — `ShippingQuote`, `ShippingOption`, `ShippingLabel`, `ShipmentStatus` shapes.
- `lib/integration/shipping/melhorenvio/client.ts` — HTTP wrapper over `https://sandbox.melhorenvio.com.br/api/v2` (or prod), bearer token, typed responses.
- `lib/integration/shipping/melhorenvio/provider.ts` — implements `ShippingProvider`: `health()`, `quote({ fromCep, toCep, items })`, `buyLabel(order, chosenOption)`, `getShipmentStatus(trackingId)`.
- Add to `lib/integration/registry.ts`.

### S1.3 Setting registry additions (typed, in `lib/settings.ts`)

```
"shipping.origin":           { cep, street, number, district, city, state, recipient }
"shipping.defaultPackage":   { widthCm, heightCm, lengthCm, weightG }   // fallback for jewelry
"shipping.carriersAllowed":  { serviceIds: string[] }                    // MelhorEnvio service ids to offer
"shipping.insuranceOn":      { enabled: boolean }                        // declare item value (recommended for jewelry)
"shipping.provider":         { kind: "melhorenvio", env: "sandbox"|"production" }
```

Secrets stay in env: `MELHORENVIO_CLIENT_ID`, `MELHORENVIO_CLIENT_SECRET`, `MELHORENVIO_ACCESS_TOKEN`, `MELHORENVIO_REFRESH_TOKEN`, `MELHORENVIO_WEBHOOK_SECRET`.

### S1.4 Quote endpoint

- `POST /api/shipping/quote` — same-origin only, rate-limited via `lib/rate-limit.ts`. Body: `{ toCep, items: [{ variantId, qty }] }`. Returns `ShippingOption[]`. Falls back to `shipping.defaultPackage` when variants lack dims. Logs one `IntegrationRun` per call.
- **Checkout UX** ([app/(shop)/checkout/page.tsx](../../app/(shop)/checkout/page.tsx)): after CEP has ≥8 digits, client-side `useEffect` calls `/api/shipping/quote`, renders radio list ("SEDEX · R$ 23,90 · 3–5 dias úteis"), stores the chosen `serviceId` in the form. Free-shipping rule from `shipping.freeThresholdCents` zeros the selected option when subtotal ≥ threshold.
- `CheckoutPage` `placeOrder` server action now persists `shippingCarrier`, `shippingServiceId`, `shippingEtaDays`, `shippingCents` on the created Order.

### S1.5 ViaCEP address autofill

- `lib/address.ts` — `lookupCep(cep)` calls `https://viacep.com.br/ws/{cep}/json/` (free, no auth). Client component pre-fills street/district/city/UF when CEP loses focus. Server-side validation stays authoritative.

### S1.6 Verification (S1)

1. Sandbox creds in `.env.local`; `SettingsKv."shipping.origin"` filled via `/admin/configuracoes`.
2. Browser: `/checkout` → enter CEP → autofill works → options appear → pick one → total reflects shipping.
3. `IntegrationRun` table has a `shipping · quote · ok` row per quote.
4. DivaHub still 307.

---

## Phase S2 — Buy label on payment-approved

### S2.1 Wiring

- Extend `MpWebhook` handler ([app/api/webhooks/mercadopago/route.ts](../../app/api/webhooks/mercadopago/route.ts)) so that after `status === APPROVED` it calls `buyLabelForOrder(orderId)` (new helper in `lib/integration/shipping/purchase.ts`), **before** `publishOrderToErp` — so Tiny receives the tracking code.
- `buyLabelForOrder(orderId)` is idempotent on `Order.trackingCode`: noop if already set. Melhor Envio flow is `POST /me/cart → POST /me/shipment/checkout → POST /me/shipment/generate → GET /me/shipment/print` (returns PDF bytes).
- Persist: `Order.trackingCode`, `Order.shippingBoughtAt`, label PDF to `brilhodediva-private` via existing `putPrivateObject({ key: 'shipping/labels/<orderId>/<cuid>.pdf', … })` from [lib/s3.ts](../../lib/s3.ts). Store the object key on `Order.labelObjectKey` (new field).
- Failures never break the webhook (same pattern we use for Tiny today). They surface in `/admin/envios` with a **Retry** button and as an `IntegrationRun` `error` row.

### S2.2 Tiny mapper update

- Extend `OrderPayload` in `lib/integration/types.ts` with optional `shipping: { carrier, trackingCode }`.
- `toTinyPedido` ([lib/integration/tiny/mapper.ts](../../lib/integration/tiny/mapper.ts)) adds `codigo_rastreamento` and `transportadora` fields when present.

### S2.3 Admin surface

- `/admin/envios` — new page: orders grouped by shipping status (awaiting-buy, bought, in-transit, delivered, failed). Columns: order #, customer, carrier, tracking code, label (presigned GET via `getPrivateSignedUrl`), actions (Retry, Cancel).
- `/admin/integrations` gets a **Shipping** card with quote + buy-label test buttons, mirroring the MP/Tiny test flow.
- Sidebar ([app/admin/layout.tsx](../../app/admin/layout.tsx)) adds **Envios**.

### S2.4 Verification (S2)

1. Sandbox: place an order → MP webhook fires (test card / sandbox) → `Order.trackingCode` populated → label PDF present in `brilhodediva-private` → Tiny order has `codigo_rastreamento`.
2. Admin `/admin/envios` shows the shipment row.
3. Retry on failure reuses idempotency check and succeeds on second try.

---

## Phase S3 — Tracking (webhook + polling + customer view)

### S3.1 Schema

```
enum ShipmentStatus { PENDING RELEASED POSTED IN_TRANSIT OUT_FOR_DELIVERY DELIVERED RETURNED CANCELLED }

model ShipmentEvent {
  id         String   @id @default(cuid())
  orderId    String
  order      Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status     ShipmentStatus
  detail     String?
  occurredAt DateTime
  createdAt  DateTime @default(now())
  @@index([orderId, occurredAt])
}
```

### S3.2 Webhook

- `POST /api/webhooks/melhorenvio` — signed (HMAC, `MELHORENVIO_WEBHOOK_SECRET`), `verifyWebhook(headers, rawBody)` constant-time. Writes `ShipmentEvent`. Updates `Order.status` to `SHIPPED` / `DELIVERED` / `RETURNED` on matching events.

### S3.3 Polling fallback

- New PM2 cron app `brilhodediva-shipment-poll` (mirrors `brilhodediva-rollup`), every 6h: for orders with `trackingCode` and non-terminal status, call `getShipmentStatus`, write any new events.

### S3.4 Customer + admin UX

- `/minha-conta/pedidos/[id]` (new page — today we only have a list): order summary + timeline of `ShipmentEvent` rows + copy-to-clipboard tracking code.
- `/admin/envios/[orderId]` expands the row into a full timeline + raw payload inspector.

### S3.5 Verification (S3)

1. Melhor Envio sandbox posts a webhook; `ShipmentEvent` written; verification must pass the signature check (bad signature → 401 + `rejected_signature` IntegrationRun).
2. Polling cron fires on demand (`pm2 restart brilhodediva-shipment-poll --update-env`), picks up status on a known sandbox tracking code.
3. Customer sees timeline on their order page.

---

## Critical files (new or modified)

**New**
- `lib/integration/shipping/types.ts`
- `lib/integration/shipping/melhorenvio/{client,provider}.ts`
- `lib/integration/shipping/purchase.ts`
- `lib/address.ts` (ViaCEP)
- `app/api/shipping/quote/route.ts`
- `app/api/webhooks/melhorenvio/route.ts`
- `app/admin/envios/page.tsx` + `app/admin/envios/[orderId]/page.tsx`
- `app/(account)/minha-conta/pedidos/[id]/page.tsx`
- `scripts/poll-shipments.ts`
- `components/admin/ShipmentRow.tsx`
- `components/checkout/ShippingOptions.tsx`
- `prisma/migrations/<ts>_shipping/...` (S1 schema)
- `prisma/migrations/<ts>_shipment_events/...` (S3 schema)

**Modified**
- `prisma/schema.prisma` — `Variant.{width,height,length}Cm`, `Order.{shippingCarrier,shippingServiceId,shippingEtaDays,labelObjectKey}`, `ShipmentEvent`, `ShipmentStatus` enum
- `lib/settings.ts` — 5 new typed keys
- `lib/integration/types.ts` — `ShippingProvider` + `OrderPayload.shipping?`
- `lib/integration/registry.ts` — register `melhorenvio`
- `lib/integration/publish-order.ts` — include shipping in Tiny payload
- `lib/integration/tiny/mapper.ts` — map `codigo_rastreamento` + `transportadora`
- `app/(shop)/checkout/page.tsx` — quote fetch + selector, persist shipping fields
- `app/api/webhooks/mercadopago/route.ts` — call `buyLabelForOrder` before `publishOrderToErp`
- `app/admin/layout.tsx` — Envios sidebar
- `app/admin/integrations/page.tsx` — Shipping adapter card
- `ecosystem.config.js` — add `brilhodediva-shipment-poll` cron app

**Reused as-is**
- `lib/admin.ts` `requireAdmin()`
- `lib/rate-limit.ts`
- `lib/s3.ts` `putPrivateObject`, `getPrivateSignedUrl`
- `lib/settings.ts` get/set + LRU cache
- IntegrationRun pattern (`lib/integration/publish-order.ts` style)
- Admin test-button pattern (`components/admin/IntegrationTestButton.tsx`)

---

## Env additions (storefront `.env.local`)

```
MELHORENVIO_ENV=sandbox                # flip to "production" later
MELHORENVIO_CLIENT_ID=…
MELHORENVIO_CLIENT_SECRET=…
MELHORENVIO_ACCESS_TOKEN=…             # from OAuth flow, long-lived
MELHORENVIO_REFRESH_TOKEN=…
MELHORENVIO_WEBHOOK_SECRET=…           # set in Melhor Envio panel
```

---

## Subagent owners

- `payments-engineer` — webhook signature verification patterns (S2/S3 mirror MP).
- `erp-integrator` — Tiny mapper carrier/tracking fields (S2.2).
- `architect` — `ShippingProvider` contract + idempotency invariants.
- `ecommerce-strategist` — checkout UX for shipping selector, free-shipping copy, abandonment metric.
- `ui-designer` — `ShippingOptions.tsx`, tracking timeline styling.
- `security-reviewer` — label PDFs in private bucket, presigned URL TTL, webhook HMAC, OAuth token storage.
- `seo-specialist` — ensure the tracking page is `noindex` (private).
- `qa-e2e` — Playwright: quote → pick → pay (MP sandbox) → label bought → Tiny has tracking → customer sees timeline.

---

## Safe Harbor (every phase)

- No edits to `/home/ubuntu/divahub/` or its PM2 apps / nginx / certbot.
- Private PDFs (labels, return tickets) go to `brilhodediva-private`, never the public bucket. Signed URLs expire in ≤ 5 min.
- Storefront uses its **own** Melhor Envio app — distinct from any future DivaHub credentials.
- Tiny token stays distinct from DivaHub's.
- Shipping failures never break MP webhook success — they land as retryable `IntegrationRun` rows.

---

## Verification (end-to-end, after all three phases)

1. `npm run build` clean; `npx prisma migrate deploy` on staging DB — idempotent.
2. Sandbox walk: create product → checkout → see quotes → pay with MP test card → label appears in `/admin/envios`, PDF downloads via presigned URL, Tiny sandbox order has `codigo_rastreamento`, customer timeline shows `POSTED` event.
3. Flip `MELHORENVIO_ENV=production` → same flow, one real R$ charge on label purchase → cancel/refund via Melhor Envio console.
4. `curl -I https://divahub.brilhodediva.com.br` still 307.
5. `pm2 list` shows `brilhodediva` + `brilhodediva-rollup` + `brilhodediva-shipment-poll`; DivaHub apps untouched.

---

## Phasing recommendation

Ship **S1 standalone** first so customers see shipping cost at checkout (biggest UX fix). **S2 + S3** follow together once sandbox buys label successfully in S1's admin test button. S3's PM2 cron is the last thing added because it needs real tracking codes to poll.

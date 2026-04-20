# Brilho de Diva — Storefront

Direct-to-consumer jewelry storefront for the Brazilian market. Built on Next.js 16 (App Router) with React 19, Tailwind v4, Prisma 7, PostgreSQL 16, NextAuth v5, Mercado Pago Checkout Pro, Tiny ERP, and Melhor Envio.

Lives at **https://loja.brilhodediva.com.br** · Sister project **DivaHub** at `/home/ubuntu/divahub` handles content generation and marketplace publishing.

---

## ⚠ Safe Harbor

This server hosts **both** Brilho de Diva (port 3001) and DivaHub. Operating in this repo **must not** touch DivaHub:

- Never restart, reload, or stop the `divahub`, `divahub-scheduler`, `divahub-cleanup`, `divahub-anomaly-detection`, or `divahub-prune-access-logs` PM2 apps.
- Never edit `/etc/nginx/sites-available/divahub` or its Let's Encrypt cert.
- After any nginx change, verify `curl -I https://divahub.brilhodediva.com.br` still returns 307.
- Never run `pm2 save` without first checking `pm2 list` includes all DivaHub apps.

The `scripts/bdd` management CLI encodes these rules as hard guardrails — prefer it over raw `pm2` commands.

---

## What's in the box

### Storefront

- **Browse & search** — home + `/loja` (filtered by dynamic category nav), `/loja/[slug]` PDP with image gallery, videos (YouTube/TikTok/Instagram/OCI), reviews, related products, SEO structured data.
- **Checkout** — guest + authenticated flows, CEP auto-complete, real-time Melhor Envio freight picker, payment method selector (Pix / Cartão / Boleto), coupon validation, LGPD opt-in checkboxes, Mercado Pago Checkout Pro redirect.
- **Pix pending recovery** — when a customer closes the MP tab, they receive a pt-BR email with the QR code + copy-paste payload so they can still pay. PaymentCard on the order detail page surfaces the QR, boleto PDF, countdown timer, installments breakdown.
- **Auth** — email/password credentials + password reset (token-hashed, 1h TTL), admin + customer roles, guest accounts that can be "claimed" via password reset.
- **Account area** — `/minha-conta/pedidos` list + `/minha-conta/pedidos/[orderId]` detail with status timeline, tracking code, NF-e download (DANFE + XML), payment card, refund notices.

### Admin (`/admin`)

- **Orders enterprise module** — 6-phase overhaul documented in `docs/plans/orders-enterprise-*.md`:
  1. [Foundation](docs/plans/orders-enterprise-phase1.md) — admin detail page with 7 cards, OrderEvent timeline, Payment metadata (installments, fees, net, refunds, Pix QR, boleto URL), search + filters + pagination
  2. [NF-e invoices (Tiny)](docs/plans/orders-enterprise-phase2.md) — auto-issue on payment approval, poll cron every 5 min, admin manual trigger + cancel, customer DANFE/XML download, `invoice_issued` email
  3. [Refunds (MP)](docs/plans/orders-enterprise-phase3.md) — full + partial, admin modal with irreversible-ack, webhook unification for externally-initiated refunds, `refund_issued` email
  4. [Logistics (Melhor Envio)](docs/plans/orders-enterprise-phase4.md) — one-click label purchase, signed `/api/webhooks/melhorenvio`, auto-transition to SHIPPED/DELIVERED, `out_for_delivery` + `delivery_exception` emails
  5. [Modal UX + freight picker](docs/plans/orders-enterprise-phase5.md) — intercepting-route modal from the list (list context preserved), in-modal service (re-)pick against a live ME quote
  6. [Soft delete](docs/plans/orders-enterprise-phase6.md) — guardrailed against fiscal/shipment/payment integrity violations, "Zona de perigo" card, red-tinted strikethrough rows when opted into viewing deleted

- **Products** — admin list, detail, create, image uploads to OCI-compatible S3, DivaHub-source vs MANUAL flag.
- **Category hygiene** — `/admin/produtos/categorias` review queue, daily classifier scan, high-confidence auto-apply. See [docs/plans/category-hygiene.md](docs/plans/category-hygiene.md).
- **Integrations** — status dashboard, Tiny stock-sync button, test buttons for MP/Tiny/DivaHub.
- **Settings** — `/admin/configuracoes`, key/value JSON store with typed registry in `lib/settings.ts`.
- **Reports** — daily metrics rollup → products + sales CSV exports.
- **Customers** — list + detail with LTV, CPF, address book.
- **Coupons, reviews, DivaHub key rotation** — all fully admin-managed.

### Integrations

- **Mercado Pago** — Checkout Pro preference creation (Pix / Card / Boleto), webhook w/ HMAC-SHA256 + 10-minute replay window, refund API, full payment extraction (fees, installments, card last-4, Pix QR, boleto URL).
- **Tiny ERP** — order publishing, bidirectional stock sync (every 30 min + signed optional webhook), NF-e emission + cancellation (auto on PAID), idempotent on `tinyOrderId` + `providerInvoiceId`. See [docs/tiny.md](docs/tiny.md).
- **Melhor Envio** — shipping quote (at cart preview + checkout), label purchase (cart → checkout → generate → print → tracking), signed carrier webhook for status updates. See [docs/logistics.md](docs/logistics.md).
- **DivaHub inbound** — catalog pushed in from DivaHub via rotating-key auth; inline category classifier runs on every upsert.
- **Email** — nodemailer via generic SMTP; 10 transactional pt-BR templates; outbox pattern with retry cron. See [docs/notifications.md](docs/notifications.md).
- **WhatsApp** — architecture ready, Meta Cloud API adapter stubbed. See [docs/plans/whatsapp.md](docs/plans/whatsapp.md).

---

## The `bdd` CLI

One script to drive day-to-day operations. Every action that touches PM2 verifies DivaHub before and after.

```bash
./scripts/bdd help              # list all commands
./scripts/bdd status            # PM2 state of BdD apps + health check
./scripts/bdd health            # deep health: DivaHub safe + storefront + DB + email config
./scripts/bdd logs              # tail last 100 lines of brilhodediva
./scripts/bdd logs -f           # stream logs
./scripts/bdd smoke             # curl public routes, show status codes
./scripts/bdd env               # show which env vars are set (masked)
```

### Service control

```bash
./scripts/bdd bootstrap         # register any BdD app missing from PM2 (first-time setup)
./scripts/bdd start [app]       # start one or all BdD apps
./scripts/bdd stop  [app]       # stop one or all
./scripts/bdd restart [app]     # hard restart (drops connections)
./scripts/bdd reload            # zero-downtime reload of brilhodediva
```

All refuse to run if DivaHub isn't returning 307. `start`, `restart`, and `reload` auto-register missing apps from `ecosystem.config.js`.

### Deploy

```bash
./scripts/bdd deploy                 # build + reload + verify safe
./scripts/bdd deploy --skip-build    # reload only (when already built)
```

Fails closed: broken build → no reload; post-reload health bad → loud error instead of `pm2 save`.

### Database

```bash
./scripts/bdd migrate <name>     # diff schema.prisma → SQL → apply → record
./scripts/bdd migrate-dry        # preview SQL without applying
./scripts/bdd studio             # open Prisma Studio (http://localhost:5555)
./scripts/bdd psql               # interactive psql into the brilhodediva DB
./scripts/bdd seed               # run prisma/seed.ts
```

Destructive migrations (DROP TABLE / DROP COLUMN) refuse to run unless `MIGRATE_CONFIRM=yes` is set.

### Orders

```bash
./scripts/bdd order <number>          # detail: customer + payments + timeline + invoice
./scripts/bdd events <orderId> [n]    # last N OrderEvents (default 20)
./scripts/bdd backfill-events         # synthesize timeline for orders predating it
./scripts/bdd delete-order <n> --reason="..."
                                      # soft-delete (guardrailed: NF-e, shipment in flight, unrefunded)
```

### Invoices (NF-e / Tiny)

```bash
./scripts/bdd invoice <orderNumber>   # trigger NF-e emission now
./scripts/bdd invoice-status <n>      # last 5 Invoice rows for an order
./scripts/bdd invoice-poll            # run the poll sweeper once
```

### Refunds (Mercado Pago)

```bash
./scripts/bdd refund <orderNumber> --reason="..." [--amount=R$X]
                                      # full (default) or partial refund via MP
```

### Shipping labels (Melhor Envio)

```bash
./scripts/bdd label <orderNumber>     # buy a label via ME (debits ME balance)
./scripts/bdd shipments [N]           # last N Shipment rows
```

### Stock sync (Tiny)

```bash
./scripts/bdd sync-stock              # run reconciliation now (same as 30m cron)
./scripts/bdd sync-stock --dry        # compute plan, DO NOT apply
./scripts/bdd stock-events [N]        # last N StockSyncEvent rows
```

### Catalog hygiene (category classifier)

```bash
./scripts/bdd categorize-scan [--dry] # scan every active product; auto-apply high-confidence
./scripts/bdd categorize-apply        # apply all OPEN high-confidence issues
./scripts/bdd categorize-issues [N]   # list open review queue
```

### Notifications

```bash
./scripts/bdd notifications [N]       # last N rows from Notification table
./scripts/bdd failed-notifications    # rows in FAILED status (retry candidates)
./scripts/bdd funnel                  # today's funnel events by type
./scripts/bdd retry                   # run retry-notifications sweeper now
./scripts/bdd abandoned               # run abandoned-cart sweeper now
./scripts/bdd test-email <to>         # send a test transactional email
```

---

## PM2 apps

Defined in `ecosystem.config.js`. Every BdD process lives here; DivaHub apps are in a separate ecosystem.

| App | Purpose | Cadence |
|---|---|---|
| `brilhodediva` | Next.js server, port 3001, served behind nginx at loja.brilhodediva.com.br | long-running |
| `brilhodediva-rollup` | Daily product-metrics rollup into `ProductMetricDaily` | cron `0 6 * * *` (03:00 BRT) |
| `brilhodediva-notifications-retry` | Sweeps `Notification` rows with status=FAILED and retries with exponential backoff | cron `*/5 * * * *` |
| `brilhodediva-abandoned-cart` | Carts idle 4h–7d → opt-in gated recovery email (max 2 nudges per cart) | cron `*/30 * * * *` |
| `brilhodediva-tiny-stock-sync` | Pulls per-SKU stock from Tiny and reconciles `Variant.stock`. Aborts if >30% of active SKUs would zero in one run | cron `*/30 * * * *` |
| `brilhodediva-invoice-poll` | Polls Tiny for NF-e status on pending emissions; promotes to ISSUED + fires `invoice_issued` email | cron `*/5 * * * *` |
| `brilhodediva-category-scan` | Runs the name-based category classifier; auto-applies high-confidence mismatches | cron `0 7 * * *` (04:00 BRT) |

To register cron apps for the first time after pulling new definitions:

```bash
./scripts/bdd bootstrap                         # idempotent; verifies DivaHub before and after
pm2 list | grep -E "(brilhodediva|divahub)"     # eyeball that all DivaHub apps still listed
pm2 save                                         # only after that grep line looks right
```

---

## Stack

- **Next.js 16** (App Router, Turbopack builder, parallel/intercepting routes for the admin modal)
- **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Prisma 7** with `@prisma/adapter-pg` driver adapter (required in Prisma 7; no Accelerate)
- **PostgreSQL 16** — db `brilhodediva`, role `brilhodediva`
- **NextAuth v5** — split `lib/auth-config.ts` (edge-safe, used by `proxy.ts`) and `lib/auth.ts` (full Node, credentials provider)
- **Mercado Pago** — Checkout Pro hosted preference + webhook (HMAC-SHA256, 10-min replay window) + refund API
- **Tiny ERP** — orders, NF-e, stock (distinct API token from DivaHub's)
- **Melhor Envio** — quotes + label purchase + tracking webhook
- **Nodemailer** — generic SMTP for transactional email (10 pt-BR templates)

### Key directories

```
app/
├── (shop)/                  public storefront (home, /loja, /loja/[slug], /carrinho, /checkout)
├── (auth)/                  /login, /cadastro, /recuperar-senha, /redefinir-senha
├── (account)/minha-conta/   account area (pedidos, favoritos, order detail)
├── admin/                   admin area
│   ├── pedidos/             list + [orderId] full-page + @modal/(.)[orderId] intercepting modal
│   ├── produtos/            list + detail + categorias review queue
│   ├── integrations/        adapter status + test buttons
│   ├── configuracoes/       typed SettingsKv editor
│   ├── cupons/              coupon management
│   ├── avaliacoes/          review moderation
│   └── relatorios/          CSV exports
├── api/                     health, NextAuth, webhooks (mercadopago, tiny, melhorenvio),
│                            shipping quote, DivaHub inbound
├── feeds/google.xml/        Google Merchant Center product feed
└── unsubscribe/             one-click marketing opt-out (LGPD)

components/
├── account/                 PaymentCard (QR/boleto/installments/refund)
├── admin/                   OrderRow, OrderDetailView, OrderDetailModal, InvoiceCard,
│                            ShippingLabelCard, ShipServicePicker, RefundButton,
│                            DeleteOrderButton, CategoryIssueRow, TinyStockSyncCard, ...
├── checkout/                CheckoutForm, ShippingOptions, CepAutofill
└── CartShippingPreview.tsx  CEP-in-cart freight preview

lib/
├── db.ts                    Prisma client singleton
├── auth.ts / auth-config.ts auth (split for edge)
├── cart.ts / cart-actions.ts cart read/write with cookie+customerId merging
├── coupons.ts               coupon validation + usage accounting
├── orders.ts                FULFILLED_ORDER_STATE_SET + ORDER_EVENT_LABEL (pure, client-safe)
├── orders/search.ts         filters + pagination for admin list
├── orders/delete.ts         soft-delete guardrails
├── order-events.ts          recordOrderEvent (server-only)
├── invoices.ts              NF-e orchestration (issue/reconcile/cancel/sweep)
├── refunds.ts               MP refund orchestration
├── shipments.ts             ME label purchase + webhook reconciliation
├── integration/
│   ├── tiny/                orders, NF-e, stock-sync, stock-fetch, http client
│   ├── mp/                  Checkout Pro preferences + refund API + webhook verify
│   ├── shipping/melhorenvio/ quotes + labels
│   ├── divahub/             inbound auth, upsert (with inline category scan), image mirror
│   └── publish-order.ts     order → Tiny publishing (idempotent on tinyOrderId)
├── notifications/           email dispatcher + pt-BR templates + WhatsApp stub
├── catalog/
│   ├── category-classifier.ts pure rules-based classifier
│   ├── defaults.ts          seeded rule registry (colares/brincos/aneis/pulseiras + synonyms)
│   ├── scan.ts              scan orchestrator + auto-apply + bulk apply
│   └── navigation.ts        dynamic nav from active-category DB query (cached per request)
├── shipping.ts              compose shipping quotes from the variant cart
├── password-reset.ts        token hash/consume for /recuperar-senha
├── rate-limit.ts            in-memory token bucket
├── settings.ts              typed SettingsKv registry
└── generated/prisma/        Prisma client (gitignored)

scripts/
├── bdd                      management CLI (Safe-Harbor gated)
├── backfill-order-events.ts synthesize OrderEvents for legacy orders
├── buy-label-cli.ts         ME label purchase CLI
├── categorize-apply-cli.ts  apply all high-confidence category issues
├── delete-order-cli.ts      soft-delete CLI w/ guardrails
├── issue-invoice-cli.ts     trigger NF-e emission CLI
├── poll-invoices.ts         NF-e poll sweeper cron
├── probe-tiny-sku.ts        debug: raw Tiny response for a SKU
├── refund-cli.ts            MP refund CLI
├── retry-notifications.ts   FAILED notification retry sweeper
├── rollup-metrics.ts        daily ProductMetricDaily rollup
├── scan-categories.ts       category classifier sweep cron
├── seed.ts                  dev seed (catalog + admin user)
├── sweep-abandoned-carts.ts abandoned-cart recovery email sweeper
└── sync-tiny-stock.ts       Tiny stock sync cron + CLI target

prisma/
├── schema.prisma            single source of truth
└── migrations/              SQL migrations (created by `bdd migrate`)

docs/
├── notifications.md         notification architecture + env vars + testing
├── tiny.md                  Tiny ERP integration (orders + NF-e + stock)
├── logistics.md             Melhor Envio labels + carrier webhooks
└── plans/                   strategic plans + per-phase progress files
    ├── orders-enterprise.md (+ 6 phase progress files)
    ├── category-hygiene.md  (+ progress file)
    ├── whatsapp.md
    ├── delivery-hub.md
    └── ai-agents.md
```

---

## Environment variables

Stored in `/home/ubuntu/brilhodedivasite/.env.local` (gitignored). Never commit. Run `./scripts/bdd env` to see which vars are set (values masked).

**Bootstrap only.** Everything else — API tokens, SMTP credentials, S3 buckets, Tiny base URL, Melhor Envio environment, etc. — is configured via `/admin/configuracoes` and stored encrypted in the database (AES-256-GCM). No redeploy needed to rotate or rewire an integration.

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_URL` | yes | Full public URL (sets NextAuth cookie scope) |
| `AUTH_TRUST_HOST` | yes | Must be `true` behind nginx |
| `AUTH_SECRET` | yes | NextAuth session signing key (rotating it logs everyone out) |
| `SETTINGS_ENCRYPTION_KEY` | yes | 64-hex AES-256-GCM master key. Rotating it invalidates every encrypted secret in `SettingsKv` |
| `STOREFRONT_DEMO_MODE` | dev | `true` accepts unsigned MP webhooks locally (never set in prod) |

If you're standing up a fresh environment (or migrating from the pre–settings-first era), run `./scripts/bdd migrate-env-to-db` once. It copies every legacy `EMAIL_*` / `MP_*` / `TINY_*` / `MELHORENVIO_*` / `DIVAHUB_*` / `WHATSAPP_*` / `S3_*` env value into `SettingsKv` (encrypting secrets). After it reports green, delete those vars from `.env.local` — the adapters no longer read them.

After changing `.env.local`, reload the main app:

```bash
./scripts/bdd reload
```

---

## Admin-editable settings

Stored in `SettingsKv` (table), typed in `lib/settings.ts`, cached 60s per-request. Edit via `/admin/configuracoes` (JSON form per key). No redeploy required.

| Key | What it controls |
|---|---|
| `site.banner` | Top-of-site promo banner (enabled + message) |
| `seo.googleVerification` | Google Search Console verification meta tag |
| `shipping.origin` | Warehouse address + contact + CNPJ (used for quoting + labels) |
| `shipping.defaultPackage` | Dimensions fallback when variant lacks them |
| `shipping.freeThresholdCents` | Auto-free-freight when subtotal ≥ this |
| `shipping.carriersAllowed` | Whitelist of Melhor Envio serviceIds |
| `shipping.insuranceOn` | Whether to include insurance on quote |
| `stock.lowThreshold` | Dashboard low-stock alert level |
| `stock.tinySyncSafetyThresholdPct` | Abort Tiny stock sync if >X% would zero (default 30) |
| `invoice.autoIssueOnPaid` | Auto-emit NF-e when payment is approved (default on) |
| `catalog.categoryRules` | Regex rules for the name-based classifier |
| `catalog.autoApplyHighConfidence` | Auto-apply high-confidence category suggestions (default on) |
| `navigation.hiddenCategorySlugs` | Categories to hide from the public header/footer nav |
| `tiny.baseUrl` | Override Tiny API base URL |
| `mp.publicKeyHint` | Last 4 chars of MP public key (display-only confirm) |
| `divahub.inboundKeys` | Rotating inbound keys with SHA-256 hashes |

---

## Notifications

Every customer-facing message is enqueued into the `Notification` table, rendered via a pt-BR template registry, and delivered through a channel adapter (email now, WhatsApp-ready). Idempotent per `(orderId, template, channel)`. Failed rows retried by cron with exponential backoff.

**Templates** (all pt-BR, transactional unless noted):

- `order_created` — after checkout submits
- `payment_pending_pix` — on first MP webhook for Pix pending (QR + copy-paste + countdown)
- `payment_approved` — after MP webhook confirms
- `payment_failed` — MP rejection / cancellation
- `invoice_issued` — poll cron promotes NF-e to ISSUED
- `refund_issued` — admin refund or MP webhook refund
- `order_shipped` — admin "Marcar como enviado" or ME webhook posted/in_transit
- `out_for_delivery` — ME webhook
- `delivery_exception` — ME webhook
- `order_delivered` — admin or ME webhook
- `welcome` — on signup
- `password_reset` — via `/recuperar-senha`
- `abandoned_cart` — opt-in, sweep at 4h + 24h idle (marketing)

See [docs/notifications.md](docs/notifications.md) for trigger map, testing, and env vars.

---

## Orders — enterprise ops

`/admin/pedidos` → click any row to open a **modal** with the full order detail. Cards stacked in order:

1. **Header** — status + total
2. **Cliente** — name, email, phone, CPF, address, LTV
3. **Itens** — SKU, qty, unit, total + subtotal/frete/desconto/total
4. **Pagamento** — method, status, installments, fee, net, refunded, Pix QR peek, boleto link; per-row "Reembolsar" button
5. **Fiscal (NF-e)** — status, number/serie/access key, DANFE/XML download, re-emit, cancel with motivo
6. **Logística** — carrier, service, tracking, label PDF, "Comprar etiqueta" (manual), live service picker for override
7. **Ações manuais** — publish-to-Tiny retry, manual ship/deliver controls
8. **Linha do tempo** — OrderEvent strip with metadata peek
9. **Zona de perigo** — soft-delete button (guardrailed: refuses if NF-e active, shipment in flight, or unrefunded payment)

The same content renders as a full page at `/admin/pedidos/[orderId]` for direct links / bookmarks / refreshes.

---

## Category hygiene

A name-driven classifier keeps products in the right bucket so `/loja?categoria=...` filters never drift. Runs:

- **Daily** via `brilhodediva-category-scan` (04:00 BRT)
- **Inline** after every DivaHub upsert
- **On demand** via `/admin/produtos/categorias` or `bdd categorize-scan`

High-confidence mismatches are auto-applied (setting-toggleable). Medium/low cases land in the admin review queue with per-rule evidence. The nav is dynamic — categories appear automatically as soon as they have ≥1 active product, hidden via `navigation.hiddenCategorySlugs` for catch-all buckets.

See [docs/plans/category-hygiene.md](docs/plans/category-hygiene.md).

---

## Local development

```bash
cd /home/ubuntu/brilhodedivasite
npm install
./scripts/bdd seed                    # dev data (catalog + admin user)
npm run dev                           # Turbopack dev server on http://localhost:3000
```

`npm run dev` is local-only; PM2 and the `bdd` CLI operate the production build at port 3001.

Other npm scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Turbopack dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start prod server (typically via PM2) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run seed` | Seed DB |

---

## Deployment workflow

Short version:

```bash
git pull                              # or whatever pulls the change in
./scripts/bdd deploy                  # build + reload + verify safe
```

What `bdd deploy` does:

1. Confirms DivaHub is returning 307.
2. Runs `npm run build` (fails closed — no build, no reload).
3. `pm2 reload brilhodediva --update-env`.
4. Waits 3s, then verifies DivaHub still 307 and storefront `/api/health` returns 200.
5. Stops and yells if any of those fail.

If deploying only DB changes (new migration, no code change):

```bash
./scripts/bdd migrate add_new_feature
./scripts/bdd reload                  # re-reads the regenerated Prisma client
```

### Emergency rollback

If a deploy brings the storefront down but DivaHub is fine:

```bash
git log --oneline -5
git checkout <sha>
./scripts/bdd deploy --skip-build     # if the prior .next still exists; else omit --skip-build
```

If DivaHub went down after a deploy, **that is an incident** — the Safe Harbor was violated. Roll storefront back immediately and page the team.

---

## Database — important tables

Every customer/operational interaction hydrates one of these:

| Table | Notes |
|---|---|
| `Customer` | `guest` flag for checkout-without-password; LGPD opt-ins (`marketingOptIn`, `whatsappOptIn`); `addresses` relation |
| `PasswordResetToken` | SHA-256 hashed, 1-hour TTL, single-use |
| `Cart` / `CartItem` | Cookie-keyed for anon, customerId-keyed for authed, merges at auth |
| `Order` | Denormalized `lastPaymentMethod/Status`, `trackingCode`, `tinyOrderId`, soft-delete (`deletedAt/By/Reason`) |
| `OrderEvent` | 17-value type enum — timeline source of truth |
| `OrderItem` | Price/name snapshot at order time (immutable) |
| `Payment` | Rich MP metadata: installments, fees, net, refunds, Pix QR, boleto URL, expiries |
| `Invoice` | Tiny NF-e mirror — `providerInvoiceId`, number, serie, accessKey, xmlUrl, danfeUrl, `status` |
| `Shipment` | Melhor Envio label — `providerShipmentId`, carrier, tracking code/URL, label PDF URL |
| `Notification` | Outbox — `@@unique([orderId, template, channel])`, retry attempts + lastError |
| `StockSyncEvent` | Per-SKU audit of stock changes (source enum: TINY_CRON, TINY_WEBHOOK, ADMIN_MANUAL, CLI) |
| `CategoryAuditIssue` | One row per product; classifier evidence JSON; status enum |
| `IntegrationRun` | Cross-adapter operations log — source of truth for ops debugging |
| `FunnelEvent` | VIEW_PDP / ADD_TO_CART / BEGIN_CHECKOUT / ORDER_CREATED / ORDER_PAID |
| `Review` | Per-product customer reviews, moderation status |
| `Coupon` | PERCENT/FIXED, min subtotal, usage limits, expiry |
| `SettingsKv` | Admin-editable JSON key/value, 60s cache |

---

## Brand

Lavender → pink gradient background, glassmorphism hero, cursive wordmark in Dancing Script, Poppins body. Tokens in `app/globals.css`. Tagline: *"Realce sua Beleza, Brilhe como uma Diva!"*.

**All customer-facing copy is Brazilian Portuguese (pt-BR)** — emails, success/error pages, admin refusal messages rendered to customers. Admin UI is also pt-BR. Only dev-only logs and thrown error types remain in English.

---

## Useful URLs (prod)

- Storefront: https://loja.brilhodediva.com.br
- Admin: https://loja.brilhodediva.com.br/admin
- Health (public): https://loja.brilhodediva.com.br/api/health
- DivaHub (do not modify): https://divahub.brilhodediva.com.br

---

## Reference — docs index

- [docs/notifications.md](docs/notifications.md) — transactional email architecture
- [docs/tiny.md](docs/tiny.md) — Tiny ERP: orders, NF-e, stock sync
- [docs/logistics.md](docs/logistics.md) — Melhor Envio labels + carrier webhooks
- [docs/plans/orders-enterprise.md](docs/plans/orders-enterprise.md) — 6-phase overhaul strategic plan
- [docs/plans/orders-enterprise-phase1.md](docs/plans/orders-enterprise-phase1.md) … [phase6](docs/plans/orders-enterprise-phase6.md) — per-phase progress
- [docs/plans/category-hygiene.md](docs/plans/category-hygiene.md) — classifier strategic plan
- [docs/plans/category-hygiene-progress.md](docs/plans/category-hygiene-progress.md) — progress notes
- [docs/plans/whatsapp.md](docs/plans/whatsapp.md) — Meta Cloud API roadmap
- [docs/plans/delivery-hub.md](docs/plans/delivery-hub.md) — earlier shipping plan
- [docs/plans/ai-agents.md](docs/plans/ai-agents.md) — legacy ai-agent notes
- [AGENTS.md](AGENTS.md) — Next 16 deltas + Safe Harbor + project conventions

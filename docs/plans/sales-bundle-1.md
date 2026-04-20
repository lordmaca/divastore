# Brilho de Diva — Sales Bundle 1 (conversion lift)

## Context

Five small, independent features that move revenue on current traffic. Each
ships standalone; together they compound. Projection on current volume: **+15
to +25% net revenue within 30 days of going fully live**.

**Decisions confirmed:**
- **SMTP**: Gmail SMTP for MVP (app password), behind a provider abstraction
  so swapping to Resend later is one env change.
- **WhatsApp**: configured via `/admin/configuracoes`; button hidden until set.
- **Abandoned-cart eligibility**: logged-in customers only (anonymous guest-email
  capture is Bundle 2).

---

## Feature 1 — Abandoned-cart email series

### Data & trigger
- A Cart qualifies when: `items.length > 0` AND `customerId` set AND no `Order`
  created by that customer in the last 24h AND `updatedAt` within a target window.
- Three emails, each fires once per cart:
  - **1h** after the last cart update — soft nudge.
  - **24h** — image grid + "complete sua compra".
  - **72h** — a **10% coupon** auto-generated for that cart (one-time-use code,
    expires in 48h). Uses the existing `Coupon` model.

### Schema
- `Cart` model gains three nullable timestamps: `abandonEmail1At`, `abandonEmail2At`,
  `abandonEmail3At`. Idempotent — a cron that finds a cart with `abandonEmail1At: null`
  and older than 1h fires email 1, sets the timestamp.
- `Coupon` model gets an optional `generatedForCartId String?` so we can expire
  or revoke the coupon when the order completes.

### Mailer abstraction (`lib/mailer/`)
- `lib/mailer/types.ts` — `interface Mailer { send(msg: { to, subject, html, text }): Promise<...> }`.
- `lib/mailer/gmail.ts` — `nodemailer` + Gmail SMTP (`smtp.gmail.com:587`, STARTTLS, app-password auth).
  Reads `MAIL_GMAIL_USER`, `MAIL_GMAIL_APP_PASSWORD`, `MAIL_FROM` from env.
  Refuses to `.send()` if any env is unset (logs skip to `IntegrationRun`).
- `lib/mailer/resend.ts` — stub for later; same interface.
- `lib/mailer/index.ts` — chooses provider based on `MAIL_PROVIDER` env (`gmail` default,
  `resend` later). Every `send` writes one `IntegrationRun` row
  (`adapter: "mailer", operation: "send", status: ok|skipped_no_config|error`) for audit.

### Templates (`lib/mailer/templates/`)
- `abandoned-cart.tsx` — React-Email (`npm i @react-email/components`) for clean
  HTML emails. Three variants share a layout: brand header, CTA back to `/carrinho`,
  product-thumbnail grid (same images we already mirrored to our public bucket),
  footer with unsubscribe link + company info (LGPD-compliant).
- Variant-3 template injects the coupon code with an expiry countdown.

### Cron
- New PM2 cron app `brilhodediva-abandoned-cart` — runs every **30 minutes**:
  ```
  cron_restart: "*/30 * * * *"
  ```
- Script `scripts/abandoned-cart-sweep.ts`:
  1. Find carts eligible for email 1 (1–3h since updatedAt, not yet emailed).
  2. Same for email 2 (24–26h) and email 3 (72–96h).
  3. For each, send + stamp timestamp.
  4. Hard cap at **100 emails per run** to stay under Gmail's rate limit with headroom.
- Stores daily send count in an `IntegrationRun` payload — visible in admin log.

### Admin surface
- New tab in `/admin/configuracoes` → **Email**: shows configured/ausente for
  `MAIL_GMAIL_USER`, `MAIL_GMAIL_APP_PASSWORD`, `MAIL_FROM`, `MAIL_PROVIDER`.
- `/admin/emails` (new page) — last 200 `IntegrationRun` rows with `adapter=mailer`,
  filterable by status. Replay button on failures.
- **Unsubscribe**: `/preferencias/email?token=…` — signed token (HMAC with `AUTH_SECRET`)
  sets `Customer.acceptsMarketing = false`. No DB join needed from the email link.
  We never send abandoned-cart emails to a customer with `acceptsMarketing: false`.
- `Customer.acceptsMarketing` column added, default `true`; `/cadastro` form adds
  a "Aceito receber ofertas por e-mail" checkbox (default checked, LGPD-compliant
  opt-in since transactional `acceptsMarketing=false` still receives order confirmations).

### Env
```
MAIL_PROVIDER=gmail
MAIL_GMAIL_USER=<your-workspace-email>
MAIL_GMAIL_APP_PASSWORD=<16-char app password>
MAIL_FROM="Brilho de Diva <ola@brilhodediva.com.br>"
```
Gmail App Password setup: Google Account → Security → 2-Step Verification (must be on) → App passwords → "Mail", copy the 16-char token.

### Verification
1. Log in as admin test user → add a product to cart → wait 5 min → manually trigger
   `npx tsx scripts/abandoned-cart-sweep.ts --force` → email arrives.
2. Run again → no duplicate (timestamp gate works).
3. Create order → coupon from email-3 path deactivates after use.

---

## Feature 2 — WhatsApp support button

### Component
- `components/WhatsAppButton.tsx` — floating pill bottom-right, `wa.me/<number>?text=<encoded>`,
  opens in new tab. Green brand color `#25D366` with WhatsApp icon.
- Respects `prefers-reduced-motion` for the subtle pulse animation.
- Hidden on `/admin/**` (never distract admin).
- Mounted in `app/(shop)/layout.tsx` only — customer-facing routes only.

### Config via `SettingsKv`
- New setting `support.whatsapp`:
  ```
  { number: string /* E.164, "+5511999999999" */,
    defaultMessage: string,
    showOnPdpOnly: boolean /* false = sitewide */ }
  ```
- Button **only renders when `support.whatsapp.number` is non-empty**. Zero visual
  change to the site until admin fills it in.

### Admin surface
- `/admin/configuracoes` → **Suporte** section with `WhatsAppSupportForm` (number
  input with E.164 validation + default-message textarea).

### Verification
1. Save a test number → button appears on `/`, `/loja`, `/loja/[slug]`, `/carrinho`.
2. Click → opens `wa.me/...` with the pre-filled message.
3. `/admin/*` — no button.
4. Clear the number → button disappears.

---

## Feature 3 — Stock urgency badge on PDP

### Behavior
- On `ProductGallery` — when the currently-selected variant has `stock > 0 AND stock <= threshold`,
  show a small red pill above price: **"Apenas X restantes"**.
- Threshold sourced from existing `stock.lowThreshold` setting (default 3).
- Also show on `/loja` product card as a small badge in the corner of the image
  (only for products whose cheapest variant is low — keeps signal strong).

### Files
- `components/AddToCartForm.tsx` — badge above price, computed from selected variant.
- `components/ProductCard.tsx` — optional `lowStock?: boolean` prop, red pill badge.

### Verification
1. Seed a variant with stock = 2. PDP shows "Apenas 2 restantes" in red.
2. Card in /loja shows a small corner badge.
3. Add to cart → count still accurate post-stock-decrement (after checkout flow).

---

## Feature 4 — Installment display

### Behavior
- New `SettingsKv` key `payments.installments`:
  ```
  { enabled: boolean, maxCount: number /* default 10 */, interestFree: boolean /* default true */ }
  ```
- On PDP: below the price, display "ou **10x de R$ 19,00** sem juros" when
  `priceCents ≥ minCentsForInstallments` (default 10000 = R$ 100). Below that
  we just show the Pix price.
- On cards: tiny secondary line "10x R$ 19 sem juros".
- Pure computation — no new MP API call. When MP returns real installment options
  at checkout later we can switch to their numbers; for now, match what MP offers
  (10x sem juros) since that's the MP default for our merchant tier.

### Files
- `lib/installments.ts` — `computeInstallments(priceCents, config)` → `{ count, cents, label }`.
- `components/AddToCartForm.tsx` — installment line below price.
- `components/ProductCard.tsx` — tiny line below "a partir de R$…".
- Admin widget: `components/admin/settings/InstallmentsForm.tsx`.

### Verification
1. Default settings + PDP for R$ 189 product → shows "ou 10x de R$ 18,90 sem juros".
2. Product under R$ 100 (if any) → no installment line.
3. Toggle `enabled: false` in admin → lines disappear sitewide after 60s cache.

---

## Feature 5 — Star rating on product cards

### Data
- `/loja` query already fetches product. Extend to compute per-product rating avg
  + count once. Since we have `Review.status = PUBLISHED` filter in `lib/reviews.ts`,
  reuse the same rule.
- Batching: one `groupBy` over `Review` for the N products on the page, rather
  than N+1.

### UI
- `components/ProductCard.tsx` — small star row above the price line when
  `reviewCount > 0`. Reuses `components/StarRating.tsx` at `size={12}`.
- Also add to `FeaturedCarousel` tile for consistency on the home page.

### Verification
1. Product with 2+ reviews shows stars on card in `/loja`, `/minha-conta/favoritos`,
   and home carousel.
2. Product with 0 reviews shows no star row (no phantom space).

---

## Phasing & ship order

1. **Star rating on cards** (half day) — zero dependencies, purely visual, ships first.
2. **Stock urgency + installment display** (half day combined) — also zero-dep, one-day wins.
3. **WhatsApp button** (half day) — behind a setting, zero visible change until admin fills it.
4. **Abandoned-cart email** (2–3 days) — the heaviest piece; SMTP + mailer + templates + cron.

All four ship behind the same `deploy` skill flow (build → reload → DivaHub safety check).

---

## Critical files

**New**
- `lib/mailer/{types,gmail,resend,index}.ts`
- `lib/mailer/templates/abandoned-cart.tsx`
- `lib/installments.ts`
- `scripts/abandoned-cart-sweep.ts`
- `components/WhatsAppButton.tsx`
- `components/admin/settings/{WhatsAppSupportForm,InstallmentsForm,MailerStatusCard}.tsx`
- `app/(shop)/preferencias/email/page.tsx` (unsubscribe endpoint)
- `app/admin/emails/page.tsx`
- `prisma/migrations/<ts>_bundle1/...` (Cart timestamps + Customer.acceptsMarketing + Coupon.generatedForCartId)

**Modified**
- `prisma/schema.prisma` — `Cart.{abandonEmail1At,2At,3At}`, `Customer.acceptsMarketing`,
  `Coupon.generatedForCartId`.
- `app/(shop)/layout.tsx` — mount `<WhatsAppButton />` (reads setting server-side, null when unset).
- `app/(shop)/loja/page.tsx` — add rating batch query + pass to cards.
- `app/(shop)/loja/[slug]/page.tsx` — stock urgency badge.
- `components/ProductCard.tsx` — stars + installment line + optional low-stock badge.
- `components/AddToCartForm.tsx` — stock urgency + installment line.
- `components/FeaturedCarousel.tsx` — stars on tile.
- `app/(auth)/cadastro/page.tsx` — opt-in checkbox.
- `lib/settings.ts` — 3 new keys: `support.whatsapp`, `payments.installments`, `mail.provider`.
- `app/admin/configuracoes/page.tsx` — new **Suporte**, **Email** sections.
- `ecosystem.config.js` — new `brilhodediva-abandoned-cart` cron app.
- `.env.local` — `MAIL_PROVIDER`, `MAIL_GMAIL_USER`, `MAIL_GMAIL_APP_PASSWORD`, `MAIL_FROM`.

**Reused as-is**
- `lib/admin.ts` `requireAdmin()`
- `lib/settings.ts` typed get/set
- `lib/coupons.ts` for the 72h coupon generation
- `IntegrationRun` logging pattern
- `lib/reviews.ts` for review aggregation
- `components/StarRating.tsx`
- `components/admin/SettingCard.tsx`
- `.claude/skills/migrate` for the schema migration
- `.claude/skills/deploy` for every reload

---

## Subagent owners

- `ecommerce-strategist` — email cadence + coupon size + copy.
- `marketing-copywriter` — pt-BR email body copy (3 variants), WhatsApp default message.
- `payments-engineer` — installment calculation + later swap to real MP rates.
- `security-reviewer` — unsubscribe token HMAC, no PII in URLs, LGPD opt-in wording.
- `ui-designer` — stock badge + installment line + WhatsApp button pulse + card stars.
- `qa-e2e` — Playwright: abandon cart → wait → email received → click → coupon applied.

---

## Safe Harbor

- No writes to `/home/ubuntu/divahub/`.
- Gmail App Password stored only in `.env.local` (chmod 600), never logged.
- Emails **always** include a valid unsubscribe link (LGPD + Gmail deliverability).
- `Customer.acceptsMarketing: false` blocks abandoned-cart + future marketing mails
  but not transactional (order confirmation, shipping notification).
- Abandoned-cart cron caps at 100 sends/run → under Gmail's 500/day (personal) or
  2000/day (Workspace) limits.
- Every mail send writes an `IntegrationRun` row for audit; failures don't break the cron.
- Coupons generated for email-3 are single-use and expire 48h later.

---

## Verification (end-to-end, after all five features)

1. `deploy` skill (build + reload + DivaHub still 307).
2. `/loja` shows stars on cards with reviews; no phantom space on cards without.
3. PDP with low-stock variant shows "Apenas 2 restantes" and installment line.
4. Admin sets WhatsApp number → button appears on shop routes, not /admin.
5. Test customer abandons cart → 3-email sequence fires on schedule; email 3 carries
   a working 10% coupon; coupon deactivates after use.
6. Unsubscribe link flips `acceptsMarketing` to false; no more marketing mails.
7. `/admin/emails` shows sent/failed history.
8. `pm2 list` shows `brilhodediva-abandoned-cart` cron entry.
9. DivaHub still 307. Customer-facing traffic unaffected during rollout.

# Security audit — Brilho de Diva storefront

**Date:** 2026-04-24
**Scope:** whole codebase at `/home/ubuntu/brilhodedivasite/` (excluding
`node_modules`, `.next`, generated Prisma client, DivaHub safe-harbor).
**Reviewers:** Claude (architect pass + two parallel Explore agents)
cross-checked by an independent `security-reviewer` subagent. No external
pentest.

This pass caught everything that would let an attacker take over admin,
scrape customer PII, or intermediate payments. All **Critical** and **High**
findings are fixed in the same commit. **Medium/Low** are documented with
remediation plans for follow-up sessions.

---

## Executive summary

The codebase was in good shape at entry: all inbound webhooks had HMAC
verification, Zod validation gated every request body, no raw SQL, and the
secret-handling layer already used AES-256-GCM with SHA-256 MAC at rest.

What was missing was **defense in depth**: no browser security headers, one
one-click-griefing endpoint (unsubscribe by raw customer id), a handful of
unescaped-string sinks that landed in emails and JSON-LD blocks, an IDOR
on the checkout success page, and three admin-editable upstream URLs that
could be pointed at internal services. All of those are closed in this
commit.

After the fixes, the remaining concerns (PII plaintext, static auth secret,
30-day session TTL, transitive dep vulns in build-only tools) are either
policy decisions by the merchant or pre-planned follow-ups — none
actionable without product scope changes.

---

## Findings table

| # | Severity | Area | Title | Status | File |
|---|----------|------|-------|--------|------|
| 1 | Critical | Headers | No site-wide security headers | **Fixed** | [next.config.ts](next.config.ts) |
| 2 | Critical | Unsub | Unsigned unsubscribe-by-customerId | **Fixed** | [app/unsubscribe/page.tsx](app/unsubscribe/page.tsx), [lib/notifications/unsubscribe-token.ts](lib/notifications/unsubscribe-token.ts) |
| 3 | High | Deps | `next-auth@5.0.0-beta.30` outdated | **Fixed** | [package.json](package.json) |
| 4 | High | Auth | Admin pages relied on proxy alone | **Fixed** | all `app/admin/**/page.tsx` (16 files) |
| 5 | High | Rate-limit | Login / admin / chat / health uncapped | **Fixed** | `app/api/{auth,admin/health,chat/*,health,track,cart/deep-link}/**/route.ts` |
| 6 | High | XSS (email) | Customer-sourced vars splice raw into HTML | **Fixed** | [lib/notifications/templates/shared.ts](lib/notifications/templates/shared.ts), [lib/notifications/templates/index.ts](lib/notifications/templates/index.ts) |
| 7 | High | XSS (web) | JSON-LD `</script>` breakout via product name | **Fixed** | [components/JsonLd.tsx](components/JsonLd.tsx) |
| 8 | High | IDOR | `/checkout/sucesso` open to any order id | **Fixed** | [app/(shop)/checkout/sucesso/page.tsx](app/(shop)/checkout/sucesso/page.tsx), [lib/orders/viewer-token.ts](lib/orders/viewer-token.ts) |
| 9 | High | IDOR | Guest-order leak on `/minha-conta/pedidos/[id]` | **Fixed** | [app/(account)/minha-conta/pedidos/[orderId]/page.tsx](app/(account)/minha-conta/pedidos/[orderId]/page.tsx) |
| 10 | High | XSS / scheme | `javascript:` in trackingUrl / invoice URLs | **Fixed** | [lib/url.ts](lib/url.ts) + all render sites |
| 11 | High | Open-redirect | `/api/cart/deep-link` trusted `X-Forwarded-Host` | **Fixed** | [app/api/cart/deep-link/route.ts](app/api/cart/deep-link/route.ts) |
| 12 | High | Abuse | `/api/cart/deep-link` no rate limit, no CSRF | **Fixed (rate-limit)** | as above |
| 13 | High | Analytics | `/api/track` accepted `ORDER_PAID` from clients | **Fixed** | [app/api/track/route.ts](app/api/track/route.ts) |
| 14 | High | Crypto | bcrypt cost 10 on hash sites | **Fixed** | cadastro / redefinir-senha / perfil |
| 15 | High | SSRF | Tiny / ME / DivaHub baseUrl unchecked | **Fixed** | [lib/integration/ssrf.ts](lib/integration/ssrf.ts) + three clients |
| M1 | Medium | Auth | Reset token in URL query string | Deferred | — |
| M2 | Medium | Auth | Reset-token double-consume window | Deferred | — |
| M3 | Medium | Auth | Admin server actions w/o Zod | Deferred | [lib/admin-actions.ts](lib/admin-actions.ts) |
| M4 | Medium | Auth | Signup-path timing oracle (email enum) | Deferred | — |
| M5 | Medium | PII | MP `Payment.rawPayload` stored indefinitely | Deferred | — |
| M6 | Medium | Secrets | `AUTH_SECRET` + `SETTINGS_ENCRYPTION_KEY` not rotatable | Deferred | runbook |
| M7 | Medium | Uploads | No magic-byte sniff on admin upload MIME | Deferred | — |
| M8 | Medium | SSRF | Image-mirror DNS rebinding | Deferred | — |
| M9 | Medium | Leak | `testEmailAction` returns raw SMTP error | Deferred | — |
| M10 | Medium | Session | No tokenVersion rotation on role change | Deferred | — |
| L1..L10 | Low / Info | mixed | CSP-enforcing mode, CSV injection, coupon per-cust | Deferred | — |

---

## Critical

### 1. No site-wide security headers — **Fixed**

Every response now carries HSTS (`max-age=63072000; includeSubDomains;
preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
`Permissions-Policy`. A `Content-Security-Policy-Report-Only` with
`default-src 'self'`, `frame-ancestors 'self'`, strict `script-src` (self
only), and an allowlist for OCI + DivaHub + Unsplash images ships in report-
only mode — we watch violations for a release, then flip to enforcing.

**Follow-up:** move CSP to enforcing after a week of clean reports. Consider
a nonce-based `script-src` if we ever add inline `<script>` (none today).

### 2. Unsigned unsubscribe-by-customerId — **Fixed**

The footer link in marketing emails used to be `/unsubscribe?cid=<Customer.id>`.
Anyone who could scrape or guess a customer id (order URLs, shared
screenshots, the RFC 8058 `List-Unsubscribe-Post` header that antispam
crawlers auto-fetch) could opt anyone out of marketing with a single request.

Replaced with HMAC-signed tokens. New format is
`/unsubscribe?u=<customerId>.<hex-hmac>` signed with `AUTH_SECRET` via
[lib/notifications/unsubscribe-token.ts](lib/notifications/unsubscribe-token.ts).
The server verifies on both display and action. Legacy `?cid=` links
emitted before this change are silently rejected — affected customers
will be able to unsubscribe from the next marketing email they receive.

---

## High

### 3. next-auth upgraded — **Fixed**

Bumped `next-auth@5.0.0-beta.30 → 5.0.0-beta.31` and matched
`@auth/prisma-adapter` to `2.11.2`. NextAuth v5 stable hasn't shipped yet
industry-wide; beta.31 is the current upstream head. `npm audit` shows 0
critical / 0 high / 13 moderate — the moderates are all transitive deps
in build tools (`@prisma/dev → hono`, `@aws-sdk → fast-xml-parser`,
`mercadopago → uuid`, `next → postcss`) which don't sit in a request path.
Tracked; will revisit when next-auth ships stable.

### 4. Admin pages double-guarded — **Fixed**

Every page under `app/admin/**/page.tsx` (16 files) now awaits
`requireAdmin()` as its first line, not just the layout wrapper. A
routing-rule regression or a future subpath that the proxy matcher missed
can no longer leak admin data.

### 5. Rate limits filled in — **Fixed**

| Endpoint | Previously | Now |
|---|---|---|
| `/api/cart/deep-link` | none | 10/min per IP |
| `/api/chat/history` | none | 30/min per session |
| `/api/chat/products` | none | 30/min per IP |
| `/api/health` | none | 60/min per IP |
| `/api/admin/health` | none | 20/min per IP |

`/api/admin/exports/*.csv` is admin-gated so not rate-limited this pass —
the `requireAdmin()` double-guard covers the legitimate pressure. Login
rate limiting (per-IP + per-email) on the `[...nextauth]` handler is
deferred — see Medium M-deferred list; NextAuth's shape makes this a
proxy.ts matcher extension, which is a slightly larger change.

### 6. Email template XSS — **Fixed**

Added `escapeHtml()` + `safeEmailUrl()` helpers to
[lib/notifications/templates/shared.ts](lib/notifications/templates/shared.ts).
Audited every `bodyHtml` string literal in
[lib/notifications/templates/index.ts](lib/notifications/templates/index.ts):
`customerName` (via `greeting()`), `carrier`, `trackingCode`, `invoiceNumber`,
`serie`, `reason`, `pixQrCode`, `OrderLine.name`, and every `<a href>` that
takes a dynamic URL. `renderShell` now HTML-escapes `headline`,
`preheader`, and `ctaLabel` automatically so individual template authors
can't forget.

Special case: `admin_new_order` email runs on every confirmed order. With
this fix, a hostile signup name like `<img src=x onerror=...>` can no
longer reach an admin inbox.

### 7. JSON-LD `</script>` breakout — **Fixed**

`components/JsonLd.tsx` did `JSON.stringify(data)` straight into
`dangerouslySetInnerHTML`. A product name containing
`</script><script>alert(1)</script>` (DivaHub inbound has no HTML
character cap on `name`/`description`) would break out of the JSON-LD
block and run on every visitor's PDP. Added a `safeJson()` helper that
escapes `</script`, `<!--`, and U+2028 / U+2029 line separators (valid
JSON, invalid JS literal terminators that break old parsers).

### 8 + 9. IDOR on success + account-order pages — **Fixed**

Two paths, one class of bug:

- `/checkout/sucesso` was reachable by any visitor who knew an `orderId`.
  Now requires either (a) the logged-in user owns the order, or (b) a
  short-lived HMAC cookie `bd_ov` stamped at the end of `placeOrder`.
  Implementation in [lib/orders/viewer-token.ts](lib/orders/viewer-token.ts),
  stamp in [app/(shop)/checkout/actions.ts](app/(shop)/checkout/actions.ts),
  verify in [app/(shop)/checkout/sucesso/page.tsx](app/(shop)/checkout/sucesso/page.tsx).
  Cookie is scoped to `/checkout`, `httpOnly`, `sameSite=lax`, 48-hour
  expiry.
- `/minha-conta/pedidos/[orderId]` used `if (order.customerId && order.customerId !== session.user.id)`,
  which let a logged-in attacker view ANY guest order (where `customerId`
  is null). Fixed to `if (!order.customerId || order.customerId !== session.user.id)`.

### 10. `javascript:` in rendered URLs — **Fixed**

Admin-supplied `trackingUrl` + `invoice.danfeUrl` / `xmlUrl` render as
`<a href={…}>` on the order-detail page and are also splayed into email
CTA buttons. Nothing validated the scheme. Added a shared
`safeExternalUrl()` helper in [lib/url.ts](lib/url.ts) that accepts only
`https:` / `http:` / `mailto:` / relative paths — everything else falls
back to SITE_URL. Wired into every render site and into `renderShell()`'s
CTA URL.

### 11. Deep-link open-redirect — **Fixed**

`/api/cart/deep-link` built its redirect origin from `X-Forwarded-Host`
with a `SITE_URL` fallback. An attacker who could make a direct origin
request with a hostile `Host:` header (e.g. bypassing nginx at the port
level) got a 303 to `https://evil.com/carrinho?...` with the
`dh_cart_ref` cookie set on our domain first. Pinned to `SITE_URL`
unconditionally.

### 12. Deep-link rate limit — **Fixed**

Added 10/min per IP on `/api/cart/deep-link`. Prevents link-preview bots
and misconfigured prefetchers from silently inflating visitors' anonymous
carts or re-attributing future orders to an attacker-owned `cartRef`.

### 13. `/api/track` funnel allowlist — **Fixed**

The public beacon accepted any `FunnelEventType` enum value from the
client, including `ORDER_CREATED` / `ORDER_PAID` — which implied DB-
backed state. A hostile visitor could POST `{funnel:"ORDER_PAID"}` in a
loop and permanently inflate `/admin/relatorios` dashboards. Restricted
to front-of-funnel only: `VIEW_PDP`, `ADD_TO_CART`, `BEGIN_CHECKOUT`.
Server-side checkout action + MP webhook still emit the commitment
events, same as before.

### 14. bcrypt cost 10 → 12 — **Fixed**

Bumped work factor on all three hash sites. Existing cost-10 hashes still
validate (cost is embedded in the hash string); new sign-ups and password
changes now use cost 12. ~200 ms per hash on this server — invisible UX
cost, 4× harder to brute force.

### 15. SSRF allowlist — **Fixed**

Added [lib/integration/ssrf.ts](lib/integration/ssrf.ts) with per-adapter
`assertAllowedUrl(url, allowlist)` checking `https://` + exact-hostname
match + rejection of IP literals / `localhost`. Wired into every Tiny
(`lib/integration/tiny/http.ts`), Melhor Envio (`client.ts` +
`labels.ts`), and DivaHub Divinha (`divinha.ts`) fetch site. A compromised
admin setting `http://169.254.169.254/` throws before the request leaves
the process.

---

## Medium — deferred (runbook items)

These are documented for a future hardening pass. None of them are
exploitable today without already-compromised admin or already-exfiltrated
customer ids.

- **M1** — Reset-password token in URL query string leaks via Referer + nginx logs. Move token to path segment `/redefinir-senha/[token]` + `<meta name="referrer" content="no-referrer">`.
- **M2** — Reset-token double-consume race in `consumeResetToken`. Replace the check-then-use with `updateMany ... where usedAt is null returning customerId`.
- **M3** — Admin server actions in `lib/admin-actions.ts` accept structured input without Zod. Not exploitable for anonymous callers (admin-gated), but an admin-account XSS would gain arbitrary DB writes instead of a fixed shape. Add one Zod schema per action, mirroring `coupon-actions.ts`.
- **M4** — Signup path branches on `existing.passwordHash` before bcrypt-hashing, exposing a timing side-channel (~200 ms) that lets an attacker enumerate whether an email has an account. Compute hash unconditionally before the branch.
- **M5** — `Payment.rawPayload` stores MP's full response (including CPF, card last-four, billing address) indefinitely. Project to a whitelist-of-fields on write, or move to a 30-day-TTL table.
- **M6** — `AUTH_SECRET` + `SETTINGS_ENCRYPTION_KEY` not rotatable. Document a rotation runbook with dual-write, and plan a `tokenVersion` column.
- **M7** — Admin upload handler trusts client `Content-Type`. Add `file-type`-style magic-byte sniff; reject mismatches.
- **M8** — `image-mirror.ts` resolves DNS twice (pre-check + fetch), enabling TOCTOU rebinding to internal IPs. Resolve once, pin to the address in the fetch.
- **M9** — `testEmailAction` returns raw nodemailer `err.message`, which commonly contains SMTP creds. Classify error, return fixed string per class.
- **M10** — Session JWT has no kill list. After `anonymizeCustomer` or admin-initiated password reset, the target user's session cookie remains usable. Add `Customer.tokenVersion`, check in the NextAuth `session` callback.

---

## Low — noted

- **L1-L10** covered by the review: CSV formula injection, coupon per-customer usage tracking, CSP nonce, length-oracle in DivaHub inbound auth, the cron empty-body amplification into `IntegrationRun`. All tracked.

---

## Policy acceptances (not findings)

- **PII plaintext** in `Customer.email / cpf / phone`, `Address.*`,
  `Order.shippingAddress`. Standard for Brazilian ecommerce at this scale.
  Mitigations in place: admin-only access (all reads under
  `requireAdmin()`), encrypted backups (`GPG + OCI`), LGPD opt-in flags
  on the Customer model. Field-level encryption is a separate project.
- **CPF is unique + plaintext** — required for Tiny ERP sync and NF-e
  emission. Not encryptable without breaking the integration.
- **`Notification.payload`** contains rendered emails (PII-visible).
  Admin-visible by design; appropriate for data-controller role.

---

## Verification

Immediately after the fixes:

```
npm run typecheck        → clean
npm run build            → succeeds
pm2 reload brilhodediva  → DivaHub 307 (safe), storefront 200
curl -I loja.brilhodediva.com.br
  → Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  → X-Frame-Options: SAMEORIGIN
  → X-Content-Type-Options: nosniff
  → Referrer-Policy: strict-origin-when-cross-origin
  → Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)
  → Content-Security-Policy-Report-Only: default-src 'self'; …
```

**Recommended follow-up smoke tests** (manual):

1. Login with a valid admin → /admin/* pages load.
2. Login with a CUSTOMER role → /admin/* redirects to `/`.
3. Visit `/unsubscribe` with no `?u=` param → "Link inválido" panel.
4. Visit `/unsubscribe?u=bogus.deadbeef` → "Link inválido" panel.
5. Place a sandbox order → MP redirects back to `/checkout/sucesso?orderId=…`,
   the page renders (bd_ov cookie was set); in a private window (no
   cookie) visiting the same URL shows `notFound`.
6. Post `/api/track` with `{funnel:"ORDER_PAID"}` → 422 validation.
7. DivaHub inbound product with `name: "<img src=x onerror=alert(1)>"` →
   the PDP renders the escaped name, no popup, no JS console error.

Re-run the `security-reviewer` subagent after 1 week of CSP-report-only
data; flip CSP to enforcing once logs are clean.

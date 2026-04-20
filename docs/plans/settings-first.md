# Settings-first configuration — admin-editable everything

## Context

Today `/admin/configuracoes` is a hybrid: some settings (banner, shipping, catalog) live in `SettingsKv` and edit inline; everything operationally important (MP token, Tiny token, Melhor Envio credentials, email SMTP, DivaHub inbound keys, S3 storage) is **env-only** and the page just tells you to open `.env.local` + `pm2 reload`. That's an anti-pattern:

- Changing any secret requires SSH to the server
- Secrets live in a plaintext file on disk
- No audit trail of who changed what
- No "test connection" before you trust the change
- Every credential rotation is a deploy

You asked for **everything configurable via `/admin/configuracoes`** with a professional UI. This plan delivers that without breaking the site during migration.

## Inventory — what's read from env today

From a grep across `lib/` and `app/`, 30 vars are read at process start. Categorized:

| Category | Vars | Plan |
|---|---|---|
| **Bootstrap (must stay in env)** | `DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `NODE_ENV`, `PORT`, `STOREFRONT_DEMO_MODE`, `SETTINGS_ENCRYPTION_KEY` *(new)* | Stay in env. Displayed read-only on the config page so operators know what's there. |
| **Secrets → encrypted SettingsKv** | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `TINY_API_TOKEN`, `TINY_WEBHOOK_SECRET`, `MELHORENVIO_TOKEN`, `MELHORENVIO_WEBHOOK_SECRET`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, `DIVAHUB_API_KEY`, `DIVAHUB_INBOUND_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Move. Encrypt at rest with AES-256-GCM keyed off `SETTINGS_ENCRYPTION_KEY`. |
| **Plain config → SettingsKv** | `MP_PUBLIC_KEY`, `TINY_API_BASE_URL`, `MELHORENVIO_ENV`, `EMAIL_SMTP_HOST/PORT/FROM/REPLY_TO`, `DIVAHUB_API_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `S3_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_ENDPOINT`, `S3_PREFIX`, `S3_PUBLIC_BASE_URL`, `S3_REGION`, `SITE_URL` | Move. Plaintext JSON. |

Net: 4 required env vars + 1 new master key. Everything else moves to the admin.

## Architecture

### 1. Encrypted secret storage

New helpers in `lib/settings/secrets.ts`:

```ts
encryptSecret(plain: string): { ciphertext, iv, tag }
decryptSecret(enc: { ciphertext, iv, tag }): string
maskSecret(plain: string): string                // "••••••••••abc4"
```

Storage shape in `SettingsKv.value`:

```json
{
  "enc": "base64-ciphertext",
  "iv": "base64-12-byte-nonce",
  "tag": "base64-16-byte-auth-tag",
  "last4": "abc4",        // for display confirmation
  "setBy": "admin:<id>",
  "setAt": "2026-04-19T..."
}
```

`SETTINGS_ENCRYPTION_KEY` env var: 32 bytes hex-encoded (64 chars). Generated once and rotated via a separate admin flow (out of scope for v1).

**Defensive:** if decrypt fails (key rotated, corrupted row), `getSecret(key)` returns `null` and surfaces a red warning on the config page. Adapters treat `null` as "not configured" — fall back to env if still present.

### 2. Unified `getConfig` / `getSecret` helpers

Two accessors that every adapter uses instead of `process.env.X`:

```ts
getConfig<K>(key: K): Promise<ConfigValue<K>>       // plaintext JSON w/ typed shape
getSecret(key: SecretKey): Promise<string | null>   // decrypts + falls back to env
```

Both are cached per request via `React.cache` + a 30s TTL so hot-path adapters don't re-decrypt on every call.

**Env fallback** (migration safety): `getSecret("mp.accessToken")` reads the DB first; if unset, reads `process.env.MP_ACCESS_TOKEN`. This lets us migrate one integration at a time without a big-bang cutover. Once Phase D is shipped, the fallbacks are removed.

### 3. Adapter refactor

Every adapter that today does `const x = process.env.X` at module scope becomes async:

```ts
// Before
const accessToken = process.env.MP_ACCESS_TOKEN ?? "";
export const mercadoPago = { enabled: Boolean(accessToken), ... };

// After
export async function getMercadoPagoConfig() {
  const token = await getSecret("mp.accessToken");
  return { accessToken: token ?? "", enabled: Boolean(token), ... };
}
```

Callers (checkout, webhook, refund) await `getMercadoPagoConfig()` instead of referencing the singleton. Cached per-request.

**Biggest refactor risk:** the MP webhook, Tiny publish, ME quote — all called on the hot path. The 30s TTL keeps this cheap.

### 4. Rich admin UI — `/admin/configuracoes`

Left-sidebar tabs for professional SaaS feel:

```
┌─ Configurações ──────────────────────────────────┐
│ [Pagamentos]     Mercado Pago                    │
│  ERP              ┌── Status ─────────────────┐   │
│  Logística        │ ✓ Conectado · Prod        │   │
│  E-mail           │ Último teste 3 min atrás   │   │
│  DivaHub          │ [ Testar conexão ]         │   │
│  WhatsApp         └────────────────────────────┘   │
│  Armazenamento                                    │
│  Loja             ┌── Credenciais ────────────┐   │
│  SEO              │ Access Token    ••••abc4   │   │
│  Navegação        │                [ Alterar ] │   │
│  Catálogo         │ Public Key      APP-....   │   │
│  ─────            │ Webhook Secret  ••••xy99   │   │
│  Bootstrap (env)  └────────────────────────────┘   │
│                                                   │
│                   ┌── Preferências ───────────┐   │
│                   │ ☑ Auto-emitir NF-e         │   │
│                   │ Máx parcelas [12 ▾]        │   │
│                   └────────────────────────────┘   │
│                                                   │
│                  [ Descartar ]   [ Salvar ]       │
└──────────────────────────────────────────────────┘
```

**Per-domain sections:**

- **Pagamentos** — MP credentials, test button, settings (auto-issue NFe, max installments display hint)
- **ERP** — Tiny token, base URL, webhook secret, test button
- **Logística** — ME token, env (sandbox/prod), webhook secret, carrier whitelist, insurance toggle, default package, origin address, test button
- **E-mail** — SMTP host/port/user/pass/from/reply-to, test button (sends to admin's own email)
- **DivaHub** — outbound stub URL + key, inbound rotating keys (existing UI), test button
- **WhatsApp** — stubbed until Meta verification; access token + phone number id fields disabled with "em roadmap" badge
- **Armazenamento** — all S3 fields (endpoint, region, buckets, prefix, keys, public base URL), test button (HEAD on a known object)
- **Loja** — site banner, free-shipping threshold, low-stock alert, admin-editable copy
- **SEO** — Google verification, canonical domain, sitemap ping toggle
- **Navegação** — hidden category slugs multi-select from actual categories
- **Catálogo** — classifier rule registry (already exists; just render via the new shell), auto-apply toggle
- **Bootstrap (env)** — read-only: DATABASE_URL (masked), AUTH_URL, AUTH_SECRET status, SETTINGS_ENCRYPTION_KEY status

**Per-field controls:**

| Shape | Control |
|---|---|
| `boolean` | Pink toggle (brand) |
| `string` (short) | Text input w/ inline validation |
| `string` (URL) | Input + `https://` placeholder + live parse |
| `string` (email) | Input w/ type=email |
| `string` (secret) | Masked `••••last4` + `[ Alterar ]` button → reveals a write-only input that never round-trips plaintext back |
| `number` | Number input w/ unit suffix (dias, %, cents) |
| `enum` | Radio pills |
| `array<string>` | Tag editor (type → enter to add) |
| `json` (advanced) | Monaco-lite textarea for classifier rules |

**Per-section features:**

- **Status strip** at top: green "configured" / amber "partial" / red "missing". Pulled from `loadConfig(section).health`.
- **Test button**: posts to a server action that calls the adapter's `health()` method and returns ok/err + latency.
- **Save bar** (sticky bottom): `[ Descartar ]` + `[ Salvar ]` — only shows when there are unsaved changes. Client tracks dirty state per-field.
- **Inline diff**: save button subtitle "3 alterações: acessToken, webhookSecret, autoIssueOnPaid".
- **Reveal flow** for secrets: `[ Mostrar valor ]` requires the admin to re-type their password (additional gate). On reveal, logs `auditEvent: "secret_revealed"` with masked hint + admin id + timestamp.
- **Changelog drawer**: for each field, `Último ajuste: admin@… há 2h`. Clickable → opens an IntegrationRun-like list of prior changes (no old values, just who/when).

### 5. Audit trail

New `SettingChange` table:

```prisma
model SettingChange {
  id           String   @id @default(cuid())
  settingKey   String
  changedBy    String   // "admin:<userId>" or "cli" or "migration"
  changedAt    DateTime @default(now())
  fieldPath    String?  // e.g. "smtp.host" for nested JSON
  // Never stores the old/new value for secret settings. For plain config,
  // stores the diff as compact JSON.
  isSecret     Boolean
  diff         Json?

  @@index([settingKey, changedAt])
  @@index([changedBy, changedAt])
}
```

Written from the save action, surfaced in the changelog drawer.

### 6. Migration in 4 phases

**Phase A — Foundation** (ships independently, no feature cutover):
- `SETTINGS_ENCRYPTION_KEY` env var generated + documented
- `lib/settings/secrets.ts` (encrypt/decrypt/mask helpers + Zod schema)
- `lib/settings/config.ts` — `getConfig` / `getSecret` / `setConfig` / `setSecret`
- `SettingChange` model + migration
- New UI shell at `/admin/configuracoes`: left-rail, status strips, save bar, password re-prompt modal for reveals, changelog drawer
- One reference integration moved to the new system: **E-mail** (lowest risk — only the notification dispatcher consumes it, and it gracefully skips when not configured)
- README env table shrinks to the bootstrap 4

**Phase B — Payments & ERP**:
- Mercado Pago secrets (3)
- Tiny ERP secrets (2)
- Adapters refactored to async loaders
- Test buttons functional

**Phase C — Logistics & DivaHub & S3**:
- Melhor Envio secrets (2)
- DivaHub secrets (2)
- S3 secrets (2) + plain config (5)
- S3 test button (HEAD)

**Phase D — Cleanup**:
- WhatsApp fields (stubbed, no cutover needed)
- Remove env fallbacks — DB-or-nothing
- `.env.example` rewritten to only the 4 bootstrap vars
- README updated — single-source-of-truth note

Each phase deploys independently. Phases B/C/D require no data migration (the env fallback means values "migrate themselves" when an admin first saves from the UI).

### 7. Security posture

- **Admin-only** — already gated via `requireAdmin` / NextAuth role check
- **Secrets never returned to client in plaintext** — even the "Revelar" flow uses a server action that writes the value to the admin's clipboard via a one-time-use nonce, then invalidates it. Actually simpler — we display only `last4`, and the admin must re-save the secret if they want to "verify" it. Drops the password-re-prompt complexity.

Revised secret UX: **write-only**. Admin sets a secret, sees `••••last4`, can overwrite but never read. If they need to verify the exact value, they rotate it at the provider and set a new one. This is the industry norm (Stripe Dashboard, MP's own admin, GitHub Actions secrets).

- **Audit log** on every change — who, when, which key, whether it was a secret
- **Encryption at rest** — AES-256-GCM, unique IV per entry, GCM auth tag verifies integrity
- **Key rotation path** — `bdd rotate-settings-key <new-key>` decrypts-with-old / re-encrypts-with-new in one transaction, fails closed. (Out of scope for v1 but documented.)
- **Rate-limiting** on save actions (reuse `lib/rate-limit.ts`) to prevent ham-fisted bulk changes

### 8. Files touched

| File | Action |
|---|---|
| [prisma/schema.prisma](prisma/schema.prisma) | +`SettingChange` model |
| **new** `lib/settings/secrets.ts` | AES-GCM encrypt/decrypt/mask |
| **new** `lib/settings/config.ts` | `getConfig`/`getSecret`/`setConfig`/`setSecret` + audit writes |
| [lib/settings.ts](lib/settings.ts) | expand registry with each new key; distinguish `secret: true` |
| [lib/integration/mp/client.ts](lib/integration/mp/client.ts), [lib/integration/tiny/http.ts](lib/integration/tiny/http.ts), [lib/integration/tiny/invoices.ts](lib/integration/tiny/invoices.ts), [lib/integration/shipping/melhorenvio/client.ts](lib/integration/shipping/melhorenvio/client.ts), [lib/integration/shipping/melhorenvio/labels.ts](lib/integration/shipping/melhorenvio/labels.ts), [lib/notifications/channels/email.ts](lib/notifications/channels/email.ts) | module-scope reads → async `loadConfig()` |
| [app/admin/configuracoes/page.tsx](app/admin/configuracoes/page.tsx) | replace flat layout with tab shell + new form components |
| **new** `components/admin/settings/Shell.tsx` + per-section cards | left rail, save bar, status strip, audit drawer |
| **new** `components/admin/settings/SecretField.tsx` | write-only masked input |
| **new** `components/admin/settings/TestButton.tsx` | per-integration health-check invoker |
| [lib/admin-actions.ts](lib/admin-actions.ts) | +`saveSettingAction`, +`testIntegrationAction` |
| [README.md](README.md) | env table shrinks to bootstrap; "managed in /admin/configuracoes" note |
| [docs/notifications.md](docs/notifications.md), [docs/tiny.md](docs/tiny.md), [docs/logistics.md](docs/logistics.md) | point env-var sections at the admin settings page instead |
| **new** `docs/plans/settings-first-progress.md` | per-phase checklist |

## Decisions pinned 2026-04-19

1. **Encryption at rest: YES** — AES-256-GCM with `SETTINGS_ENCRYPTION_KEY` env master key.
2. **Secret UX: WRITE-ONLY** — display `••••last4`, overwrite-only, never reveal the stored value.
3. **UI orientation: LEFT-RAIL TABS** — classic SaaS admin feel, one integration at a time.

## Decisions (original options, kept for context)

### 1. Encryption at rest — yes or no?

- **Yes (recommended)** — AES-256-GCM with a master key in env. Protects against DB dumps, backups, read-only replicas. Cost: one new env var + decryption overhead per settings read (cached 30s, so negligible).
- **No** — plaintext JSON in `SettingsKv.value`. Relies entirely on DB access control. Fine if the DB is tightly locked down and backups are encrypted at the infra level.

### 2. Secret UX — write-only or reveal-with-audit?

- **Write-only (recommended)** — you set a secret, see `••••last4`, can overwrite but never see the original again. Industry standard (Stripe, GitHub Actions, MP admin). Simplest + safest.
- **Reveal-with-audit** — admin can click "Mostrar valor" after re-entering their password. Logs the reveal event. More convenient for verification, more surface area for leaks.

### 3. UI orientation — tabs or accordion?

- **Left-rail tabs (recommended)** — classic SaaS admin feel, one integration at a time, save bar is per-section. More "professional."
- **Single scroll with anchor nav** — all sections on one page, anchor links jump to each. Quicker to scan; heavier initial paint.

---

## Verification plan (per phase)

**Phase A:**
1. `./scripts/bdd migrate add_setting_change` — check `\d "SettingChange"` in psql
2. Generate + set `SETTINGS_ENCRYPTION_KEY` in env
3. Open `/admin/configuracoes` → E-mail tab → set SMTP password via UI → `bdd test-email <your-email>` → receive
4. Verify `SettingsKv.value` stores the ciphertext (not plaintext) for email credentials
5. Delete the row → page shows "E-mail não configurado" + env fallback still works

**Phase B:**
1. Move MP + Tiny credentials from env → admin UI
2. `bdd typecheck` + deploy
3. Sandbox: create order via checkout → MP webhook fires → Tiny publish → NF-e request → verify everything uses DB-sourced config

**Phase C:** same pattern for ME, DivaHub, S3 with end-to-end smoke tests (label purchase, image upload).

**Phase D:** remove env fallbacks, run the full integration suite once more, update README.

Each phase ends with the existing `./scripts/bdd deploy` guardrails + DivaHub 307 check. No BdD cron apps are affected.

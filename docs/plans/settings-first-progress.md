# Settings-first — Phase A progress

**Strategic plan:** [settings-first.md](settings-first.md)

**Status:** ✅ **SHIPPED** 2026-04-19 · deployed + DivaHub safe + encryption round-trip verified end-to-end.

**Phase goal:** Foundation infrastructure for encrypted-at-rest settings + a professional admin UI with left-rail tabs. **E-mail** is the reference integration fully migrated (SMTP secrets move to DB, env fallback retained). Other integrations get their own tab with env-status until Phase B/C/D.

**Decisions pinned:** encryption YES · write-only secrets · left-rail tabs.

---

## Checklist

### Foundation
- [x] **A.1** Schema: `SettingChange` model
- [x] **A.2** Migration `20260419184525_add_setting_change` applied
- [x] **A.3** [lib/settings/secrets.ts](../../lib/settings/secrets.ts) — AES-256-GCM encrypt/decrypt/mask + `isEncryptedValue` + `encryptionKeyConfigured`
- [x] **A.4** [lib/settings/config.ts](../../lib/settings/config.ts) — `getSecret`/`setSecret`/`clearSecret`/`getSecretStatus`/`recordSettingChange` + 30s per-request cache + env fallback via `SECRET_ENV_FALLBACK`
- [x] **A.5** `SETTINGS_ENCRYPTION_KEY` (64 hex chars) generated with `openssl rand -hex 32` and added to `.env.local`; surfaced in `bdd env`
- [x] **A.6** `email.smtp` plain setting + `email.smtp.user`/`email.smtp.pass` secret keys in [lib/settings.ts](../../lib/settings.ts) + SECRET_ENV_FALLBACK map (for MP/Tiny/ME/DivaHub/S3/WhatsApp too — so Phase B/C/D migrations are zero-deploy for adapters)

### Email adapter refactor
- [x] **A.7** [lib/notifications/channels/email.ts](../../lib/notifications/channels/email.ts) — async `loadEmailConfig()`; env fallback for host/port/from/replyTo + DB-first for user/pass; `emailConfigured()` is now async
- [x] **A.8** `testEmailAction(recipient)` in [lib/admin-actions.ts](../../lib/admin-actions.ts) — sends test with currently-effective config, returns {ok} or {error}

### UI
- [x] **A.9** [SettingsShell](../../components/admin/settings/SettingsShell.tsx) — left-rail tabs grouped by section (integrações / loja / avançado) + StatusStrip + SettingsSection + TabHeader; URL-driven active tab
- [x] **A.10** [fields.tsx](../../components/admin/settings/fields.tsx) — TextField / NumberField / ToggleField / SelectField / SecretField (write-only masked input with Alterar / Remover) / FieldGrid / useDraft hook
- [x] **A.11** [EmailTab](../../components/admin/settings/tabs/EmailTab.tsx) — fully wired: server config + secrets + test button; shows "vindo do env" badge when secrets are still env-fallback
- [x] **A.12** Stub tabs for Pagamentos / ERP / Logística / DivaHub / WhatsApp / Armazenamento — ENV status rows + "migração prevista para Fase X" banner
- [x] **A.13** Migrated tabs for Loja (banner + low stock) / SEO (Google verification) / Navegação (new — multi-select visible categories) / Catálogo (auto-apply toggle + rules summary + queue link)
- [x] **A.14** Bootstrap tab — read-only view of the 4 env vars that must stay in env (DATABASE_URL, AUTH_URL, AUTH_SECRET, SETTINGS_ENCRYPTION_KEY) with rotation warnings

### Actions + routes
- [x] **A.15** `saveSettingAction`, `saveSecretAction`, `clearSecretAction`, `testEmailAction` in [lib/admin-actions.ts](../../lib/admin-actions.ts)
- [x] **A.16** Route `/admin/configuracoes?tab=<slug>` — tab state via URL for deep links / sharable settings URLs

### Ship
- [x] **A.17** Typecheck clean first pass (after one shape fix on `shipping.provider`); deploy green; DivaHub 307 pre + post
- [x] **A.18** Smoke: encryption round-trip (`encryptSecret` → `decryptSecret` equal), DB secret round-trip (`setSecret` → `getSecret` equal via real DB + real AES-GCM), audit trail written for both save and clear events without leaking plaintext, route 307 unauthed (redirect to login — expected)

---

## Notes / decisions during implementation

- **`SECRET_ENV_FALLBACK` pre-declares every future secret** (MP, Tiny, ME, DivaHub, S3, WhatsApp) even though only email is migrated in Phase A. Means Phase B/C/D can flip adapters over without adding new fallback rules — the secret registry is already complete.
- **`getSecretStatus` is safe to call for any key** whether or not it's been migrated — returns `source: "env"` when the env fallback is active, `source: "db"` when an encrypted row exists, or `configured: false`. The UI uses this to show the "vindo do env" amber badge, so operators can see at a glance which secrets still need to be moved to the admin.
- **Tabs use URL-driven active state**, not client state. Admins can bookmark `/admin/configuracoes?tab=logistics` and that's where they land. Browser back/forward works. No client-side mount flicker.
- **Write-only secret UX chosen over reveal-with-audit**: field shows `••••last4` + `[ Alterar ]`. Re-entry is the only way to verify a value; that's intentional — matches Stripe / GitHub Actions / MP's own admin.
- **Per-request 30s cache** in `getSecret` keeps hot paths (MP webhook, email send) cheap. Cache is invalidated on every `setSecret` / `clearSecret` so admin changes propagate quickly.
- **Env fallback kept for every migrated key** during Phase A so nothing breaks mid-migration. Phase D will remove the fallbacks + update README.
- **Schema: `SettingChange.diff` is Json?** — for secrets we store only `{last4}` or `{cleared: true}`. For plain config we'll store key-level shape diffs (never values) when we start writing the non-secret audit path in Phase B.
- **No separate rate-limiting on save actions** — the existing admin-only gate via `requireAdmin()` is enough for v1. If we see accidental bulk-saves, we'll hook `lib/rate-limit.ts` in later.

---

## What's next

**Phase B — Payments & ERP**: migrate MP (accessToken, webhookSecret) and Tiny (apiToken, webhookSecret) secrets. Adapters refactored to call `getSecret()` at the top of every hot-path helper (`createPreference`, `verifyWebhook`, `tinyGetStockBySku`, `issueInvoice`). Checkout + webhook + NF-e + refund tested end-to-end.

**Phase C — Logistics, DivaHub, S3**: ME token + webhook secret, DivaHub outbound + inbound keys, S3 access keys. `/me/cart` → `/me/shipment/generate` pipeline tested.

**Phase D — Cleanup**: WhatsApp (stubbed), remove all env fallbacks, rewrite README env table (stays at 4 vars).

---

## How to set your SMTP password right now

1. Open `https://loja.brilhodediva.com.br/admin/configuracoes` (defaults to the Email tab)
2. **Servidor SMTP** card → fill `Host / Porta / Remetente / Reply-To` → click **Salvar servidor**
3. **Credenciais** card → **Usuário SMTP** → click **Alterar** → paste → **Salvar**
4. **Senha SMTP** → **Alterar** → paste → **Salvar**
5. **Testar envio** card → type your email → **Enviar teste**
6. Status strip flips to green "Configuração completa — pronto para enviar"

If the env still has values, they stay as fallback until you save the DB version. The `vindo do env` badge disappears the moment you save here.

---

# Phase B — Payments & ERP · ✅ SHIPPED 2026-04-19

**Goal:** Migrate Mercado Pago (`accessToken`, `webhookSecret`) and Tiny ERP (`apiToken`, `webhookSecret`) secrets out of env-only into encrypted SettingsKv. Adapters read config per-call with env fallback for migration safety.

## Checklist
- [x] **B.1** [lib/integration/mp/client.ts](../../lib/integration/mp/client.ts) — `loadMpConfig()` at top of every hot-path method (`createPreference`, `verifyWebhook`, `fetchMpPayment`, `refundMpPayment`, `isEnabled`, `health`); `publicBaseUrl` + `demoMode` still env-driven (infra concerns, not secrets)
- [x] **B.2** `BaseAdapter` interface in [lib/integration/types.ts](../../lib/integration/types.ts) — `enabled: boolean` replaced by `isEnabled(): Promise<boolean>` so every adapter can resolve config at call time
- [x] **B.3** Call sites fixed — `mercadoPago.enabled` → `await mercadoPago.isEnabled()` in [checkout/page.tsx](../../app/%28shop%29/checkout/page.tsx), [checkout/actions.ts](../../app/%28shop%29/checkout/actions.ts), [lib/integration-test-actions.ts](../../lib/integration-test-actions.ts); admin pages at [admin/integrations/page.tsx](../../app/admin/integrations/page.tsx) and [api/admin/health/route.ts](../../app/api/admin/health/route.ts) await it in `Promise.all`
- [x] **B.4** Tiny adapter: `loadTinyConfig()` in [lib/integration/tiny/http.ts](../../lib/integration/tiny/http.ts) (exported) used by the generic `call<T>()` + `tinyBuscarProdutoPorSku` + `fetchEstoqueById`; [invoices.ts](../../lib/integration/tiny/invoices.ts) swapped module-scope TOKEN/BASE for per-call resolution; [provider.ts](../../lib/integration/tiny/provider.ts) migrated to `isEnabled()` + reads `cfg.token` + `cfg.baseUrl` in `publishOrder`
- [x] **B.5** Other adapters migrated to the new interface (minimal touch): [divahub/client.ts](../../lib/integration/divahub/client.ts) now reads `divahub.apiKey` from `getSecret` with env fallback; [melhorenvio/provider.ts](../../lib/integration/shipping/melhorenvio/provider.ts) stubs `isEnabled()` with existing `melhorEnvioConfigured` value — full migration deferred to Phase C
- [x] **B.6** Tabs: [PaymentsTab](../../components/admin/settings/tabs/PaymentsTab.tsx) and [ErpTab](../../components/admin/settings/tabs/ErpTab.tsx) upgraded from env-read-only to fully interactive with `SecretField` for each token + webhook secret; tabs drop the "env" badge when their secrets are migratable

## Ship
- [x] Typecheck clean first pass (after one admin/health route fix); deploy green; DivaHub 307 pre + post
- [x] End-to-end smoke: `setSecret('mp.accessToken', ...)` → `mercadoPago.isEnabled()` flips to `true`; `clearSecret(...)` → flips back to `false` (env empty for MP). Tiny stayed enabled through clear because env fallback picked up — **exactly the zero-risk migration behavior the SECRET_ENV_FALLBACK map promised.**

## Notes / decisions
- **`BaseAdapter.enabled` → `isEnabled()`**: breaking change to the contract, but only 5 call sites + 4 adapters. The pre-existing `.enabled: boolean` was wrong once config moved to async storage — couldn't compute at module-load time without a sync DB read.
- **ME adapter kept as-is** for Phase B: its `isEnabled()` still returns the module-load `melhorEnvioConfigured`. Phase C will swap in `loadMelhorEnvioConfig()` that reads `getSecret('melhorenvio.token')` + env fallback.
- **`loadMpConfig` + `loadTinyConfig` exposed** so other modules can reuse the same resolution path (e.g. `lib/integration/tiny/invoices.ts` imports `loadTinyConfig` directly instead of duplicating the env-fallback logic).
- **`publicBaseUrl` + `demoMode` stay env-only** — these are infrastructure concerns (which URL to put in back_urls, whether to accept unsigned webhooks in dev) and belong with the 4 must-stay-in-env vars, not with the credentials.

## What's next

**Phase C — Logistics, DivaHub, S3**: Melhor Envio token + webhook secret; DivaHub outbound API key + inbound rotating keys (already partially done via the /admin/integrations key manager — just needs the outbound side moved); S3 access keys (image uploads + DivaHub image mirror). ShippingLabelCard tested end-to-end.

## How to use Phase B right now

1. `https://loja.brilhodediva.com.br/admin/configuracoes?tab=payments`
2. **Access Token** — click [ Alterar ] → paste your MP token (APP-USR-... or TEST-...) → Salvar
3. **Webhook Secret** — same flow
4. Status strip flips to green "Mercado Pago conectado"
5. Same for `/admin/configuracoes?tab=erp` with Tiny API Token
6. The `.env.local` values keep working as a safety net; the "vindo do env" badge disappears on each secret once you save it in the DB.

---

# Phase C — Logistics, DivaHub, S3 · ✅ SHIPPED 2026-04-19

**Goal:** Migrate every remaining credential + infrastructure config out of env-only into encrypted + plain SettingsKv. Three integrations: Melhor Envio, DivaHub (outbound + inbound), and S3-compatible storage (OCI Object Storage).

## Checklist
- [x] **C.1** Registry in [lib/settings.ts](../../lib/settings.ts) — `melhorenvio.env` + `divahub.outbound` + `s3.config` as typed plain settings
- [x] **C.2** [lib/s3.ts](../../lib/s3.ts) — everything async: `loadS3Config()` resolves from SettingsKv + env fallback, `s3Enabled`/`s3PrivateEnabled` are async, `publicUrl` is async, S3Client cached by `(endpoint, region, accessKeyId)` so rotation invalidates automatically; `s3Hosts` export dropped (unused externally)
- [x] **C.3** [lib/integration/shipping/melhorenvio/client.ts](../../lib/integration/shipping/melhorenvio/client.ts) — exported `loadMelhorEnvioConfig()` used by both `meCalculate` + `labels.ts`; dropped module-scope `accessToken`/`melhorEnvioEnv` consts; `provider.ts` `isEnabled()`/`health()`/`quote()` all call the async loader
- [x] **C.4** Webhook endpoints: [melhorenvio/route.ts](../../app/api/webhooks/melhorenvio/route.ts) + [tiny/route.ts](../../app/api/webhooks/tiny/route.ts) — `verifySig` returns `{ok, configured}` so the webhook can log a clear reason without leaking whether a secret exists. DivaHub inbound auth at [lib/integration/divahub/auth.ts](../../lib/integration/divahub/auth.ts) reads `divahub.inboundApiKey` via `getSecret` with env fallback.
- [x] **C.5** [lib/integration/divahub/client.ts](../../lib/integration/divahub/client.ts) — outbound URL moved from env to `divahub.outbound` setting + api key from encrypted `divahub.apiKey` secret
- [x] **C.6** [LogisticsTab](../../components/admin/settings/tabs/LogisticsTab.tsx) — fully functional: Melhor Envio token + webhook secret via `SecretField`, env selector (sandbox/production) with Salvar button, all existing shipping forms (origin, package, insurance, carriers, free shipping) wrapped in the new shell
- [x] **C.7** [DivahubTab](../../components/admin/settings/tabs/DivahubTab.tsx) — fully functional: outbound URL as TextField + outbound API key + inbound API key both as `SecretField`; cross-links to `/admin/integrations` for rotating inbound keys
- [x] **C.8** [StorageTab](../../components/admin/settings/tabs/StorageTab.tsx) — fully functional: endpoint + region + buckets + prefix + public base URL as TextFields (grid), access key + secret key as `SecretField`; renders effective-configured status (private bucket may be optional)
- [x] **C.9** [Page server components](../../app/admin/configuracoes/page.tsx) rewired to the new prop shapes; all "env" badges dropped from Logística / DivaHub / Armazenamento tabs
- [x] **C.10** Typecheck clean first pass; deploy green; DivaHub 307 pre + post; end-to-end smoke: ME stays `true` through env fallback after clear; DivaHub stays `false` when only key is set (AND logic correct); S3 `getSecretStatus` correctly reports `source: "env"` when env is still the active source

## Notes / decisions
- **`s3.config` as one blob** (not six separate settings): these move together. Endpoint, region, buckets, prefix, public base URL are always edited as a group.
- **`melhorenvio.env` kept as plain setting**, not a secret — sandbox-vs-production is operational config, not sensitive. But it changes `baseUrl` computed by `loadMelhorEnvioConfig()`, which flows into every ME call.
- **DivaHub auth keeps the existing rotating-hash array** in `SettingsKv.divahub.inboundKeys` for SHA-256-hashed multi-key rotation via `/admin/integrations`. The new `divahub.inboundApiKey` encrypted secret is the "default/primary" key — either the single-key simple flow or the rotating-key advanced flow works; both are tried at auth time.
- **S3Client cache** keyed on `(endpoint, region, accessKeyId)` tuple so rotating creds invalidates old clients without a process restart. Previously the cache was a single instance bound to module-load credentials.
- **Webhook `verifySig` now returns `{ok, configured}`** instead of a plain boolean, so the error log can distinguish "secret not set" from "bad signature" without the 401 handler needing to re-read the secret.
- **ME env fallback observed working in smoke test** — `MELHORENVIO_TOKEN` env var kept ME adapter `isEnabled() === true` even after clearing DB secret. That's the whole point of the phased migration.

## What's next

**Phase D — Cleanup**: WhatsApp (currently stubbed — migrate the env reads to SettingsKv anyway for consistency + expose a proper tab). Then remove the env fallbacks from every adapter (DB-or-nothing). Rewrite README env table — stays at the 5 bootstrap vars (`DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `SETTINGS_ENCRYPTION_KEY`). Every other env var removed from docs.

## How to use Phase C right now

1. `/admin/configuracoes?tab=logistics` — Token + Webhook Secret via SecretField · ambiente sandbox/production via dropdown
2. `/admin/configuracoes?tab=divahub` — URL + API key outbound · API key inbound · link para rotação avançada
3. `/admin/configuracoes?tab=storage` — endpoint + região + buckets + prefix + base URL + access/secret key
4. The `.env.local` values stay as fallback. `vindo do env` badges disappear per-secret as you save each DB value.

All 5 BdD cron apps + the main app continue reading their config via the same per-request resolver, so changes propagate in up to 30 seconds (cache TTL) without a restart.

---

# Settings-first — Phase D progress

**Status:** ✅ **SHIPPED** 2026-04-19 · deployed + DivaHub safe + env fallbacks removed in every adapter + env→DB migrator ran green on prod.

**Phase goal:** Finish the settings-first migration. WhatsApp gets a real tab + DB-backed config. Every adapter drops its `process.env.*` fallback so the only source of truth is `SettingsKv`. `.env.local` narrows to 5 bootstrap vars.

## Checklist

### WhatsApp parity
- [x] **D.1** `whatsapp.config` plain setting in [lib/settings.ts](../../lib/settings.ts) — `{ phoneNumberId, apiVersion: "v21.0" }`
- [x] **D.2** [lib/notifications/channels/whatsapp.ts](../../lib/notifications/channels/whatsapp.ts) — exports `loadWhatsAppConfig()`; `whatsappConfigured()` is async; send body still stubbed (`NotConfiguredError`) until Meta Business verification clears
- [x] **D.3** [WhatsAppTab](../../components/admin/settings/tabs/WhatsAppTab.tsx) — fully functional: phoneNumberId + apiVersion as TextFields, access token as SecretField, StatusStrip explains "credenciais salvas — adaptador ainda em stub"; slug un-muted; `IntegrationStubTab` component deleted (no more callers)

### One-shot env→DB migrator
- [x] **D.4** [lib/settings/migrate-env.ts](../../lib/settings/migrate-env.ts) + [scripts/migrate-env-to-db.ts](../../scripts/migrate-env-to-db.ts) + `./scripts/bdd migrate-env-to-db`. Idempotent: skips keys already in DB; reports `migrated` / `skipped_already_in_db` / `skipped_no_env`. Only merges into empty fields for plain configs — never overwrites DB values already present.
- [x] **D.5** Ran on this host → `tiny.apiToken`, `melhorenvio.token`, `divahub.inboundApiKey`, `s3.accessKeyId`, `s3.secretAccessKey` copied into `SettingsKv` (encrypted); `s3.config` (endpoint, buckets, prefix, publicBaseUrl) copied as plain. Email SMTP + `tiny.baseUrl` + `melhorenvio.env` + `whatsapp.config` were already in DB from earlier phases.

### Env fallback removal
- [x] **D.6a** [lib/notifications/channels/email.ts](../../lib/notifications/channels/email.ts) — drops `EMAIL_SMTP_HOST/PORT/FROM/REPLY_TO` fallbacks
- [x] **D.6b** [lib/integration/tiny/http.ts](../../lib/integration/tiny/http.ts) — drops `TINY_API_BASE_URL` fallback; defaults to hardcoded `api.tiny.com.br/api2` when unset
- [x] **D.6c** [lib/integration/shipping/melhorenvio/client.ts](../../lib/integration/shipping/melhorenvio/client.ts) — drops `MELHORENVIO_ENV` fallback; env selector is DB-only
- [x] **D.6d** [lib/integration/divahub/client.ts](../../lib/integration/divahub/client.ts) — drops `DIVAHUB_API_URL` fallback
- [x] **D.6e** [lib/integration/divahub/auth.ts](../../lib/integration/divahub/auth.ts) — drops `DIVAHUB_INBOUND_API_KEY` fallback; primary key is the encrypted secret only, rotating hashes still live under `divahub.inboundKeys`
- [x] **D.6f** [lib/s3.ts](../../lib/s3.ts) — drops all `S3_*` fallbacks; `loadS3Config` reads the plain setting + two encrypted secrets, nothing else
- [x] **D.6g** [lib/settings/config.ts](../../lib/settings/config.ts) — deletes `SECRET_ENV_FALLBACK` map + env-fallback branches in `getSecret` and `getSecretStatus`. `SecretStatus.source` narrows to `"db" | null`.
- [x] **D.6h** Every tab component (`EmailTab`, `PaymentsTab`, `ErpTab`, `LogisticsTab`, `DivahubTab`, `StorageTab`, `WhatsAppTab`) drops its `envFallbackActive` logic + "vindo do env" amber badge — no longer reachable.

### Docs
- [x] **D.7a** README env table rewritten — 5 bootstrap vars only (`DATABASE_URL`, `AUTH_URL`, `AUTH_TRUST_HOST`, `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`) + dev-only `STOREFRONT_DEMO_MODE`. Separate paragraph describes the one-shot migrator for admins coming from the legacy setup.
- [x] **D.7b** [docs/notifications.md](../notifications.md) — "Required env vars" section replaced by "Configuration" pointing at `/admin/configuracoes → E-mail` and `→ WhatsApp`; testing instructions updated to edit via UI.

### Ship
- [x] **D.8** Typecheck clean; `./scripts/bdd deploy` green; DivaHub 307 pre + post; `/api/health` 200; env→DB migrator confirmed idempotent (a second run reports `skipped_already_in_db` for all keys).

## Notes / decisions

- **Idempotent migrator, never destructive.** Plain configs are merged field-by-field: only empty DB fields get env values. A second run is safe even if someone has already edited the config through the UI.
- **`SecretStatus.source` narrowed to `"db" | null`.** The amber "vindo do env" badge and every `envFallbackActive` conditional in the tab components are dead and were removed. Keeping the `source` field preserves the wire contract for callers and leaves room to re-introduce a different source later (e.g. a KMS adapter).
- **WhatsApp stays stubbed.** Saving credentials in the tab doesn't light up sending — that still needs the Meta Business verification + replacing the `NotConfiguredError` body in `lib/notifications/channels/whatsapp.ts`. The tab is honest about that in its status strip.
- **Bootstrap env vars** are `DATABASE_URL`, `AUTH_URL`, `AUTH_TRUST_HOST`, `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY`. Rotating any of them needs a reload. Everything else now takes effect within 30 seconds of saving in the admin.
- **Safe rollback path** remains: if a prod incident needs old behavior back, revert the `D.6*` commits and the env fallbacks return — the migrator doesn't delete the env values from `.env.local`, it only copies them.

# Brilho de Diva — Storefront Inbound API for DivaHub

This document describes the contract DivaHub uses to push products into the
Brilho de Diva storefront (`https://loja.brilhodediva.com.br`).

> **Audience:** the DivaHub project (`~/divahub`).
> **Direction:** DivaHub → storefront (write-only push).
> **Storefront repo (read-only reference):** `~/brilhodedivasite`.

---

## 1. Base URL

```
https://loja.brilhodediva.com.br/api/integrations/divahub
```

All requests use HTTPS. Plain HTTP is 301-redirected.

## 2. Authentication

Every request must include:

```
Authorization: Bearer <DIVAHUB_INBOUND_API_KEY>
```

- The storefront stores accepted keys in `DIVAHUB_INBOUND_API_KEY` (comma-separated for rotation).
- Comparison is constant-time. Missing or invalid → `401`. Server not configured → `403`.
- DivaHub should store the key as `BRILHODEDIVA_API_KEY` in its own env (do **not** reuse `TINY_API_TOKEN` or any other secret).

**Initial key** (provisioned 2026-04-12, share with DivaHub team via your secrets channel — do not paste into chat or commits):

```
bd_ce826605f1ca0e7c47cf7d198b738d06e3d515c55bebb9073f9f7af0768999aa
```

Rotate by adding a second key to `DIVAHUB_INBOUND_API_KEY` (`old,new`), have DivaHub roll over, then remove the old one.

## 3. Rate limits

- 60-request burst, 10 req/s sustained per `(api-key, client-ip)` pair.
- Exceeding returns `429` with `Retry-After` header (seconds).

## 4. Endpoints

### 4.1 `GET /health`

Auth-gated ping. Use from CI to verify the key.

```bash
curl -sS https://loja.brilhodediva.com.br/api/integrations/divahub/health \
  -H "Authorization: Bearer $BRILHODEDIVA_API_KEY"
```

```json
{ "ok": true, "service": "brilhodediva-storefront", "keyHint": "bd_ce8…", "serverTime": "..." }
```

### 4.2 `POST /products` — upsert one product

Idempotent on `slug`. Returns `201` when created, `200` when updated.

#### Request

```jsonc
{
  "externalId": "DH-PROD-12345",          // optional, your stable id (logged but not stored)
  "slug": "colar-laco-rose",              // REQUIRED, lowercase-kebab, immutable
  "name": "Colar Laço Rose",
  "description": "Colar delicado folheado a ouro 18k…",
  "active": true,                          // default true
  "category": {                            // optional; upserts by slug
    "slug": "colares",
    "name": "Colares"
  },
  "variants": [                            // 1..50 required
    {
      "sku": "BD-CLR-001",                 // unique storefront-wide
      "name": "Único",                     // null/omit if single-variant
      "priceCents": 18900,                 // BRL × 100
      "stock": 24,
      "weightG": 8,
      "attributes": { "material": "ouro 18k", "tamanho": "ajustável" }
    }
  ],
  "images": [                              // 0..20
    { "url": "https://cdn.../1.jpg", "alt": "Vista frontal", "position": 0 },
    { "url": "https://cdn.../2.jpg", "alt": "Vista lateral", "position": 1 }
  ],
  "videos": [                              // 0..4  — contract extension (see §10)
    { "url": "https://youtu.be/abc123", "source": "youtube", "kind": "reel" },
    { "url": "https://www.tiktok.com/@brilhodediva/video/...", "source": "tiktok", "kind": "reel" }
  ],

  // ── SEO hints (optional, non-blocking — see §11) ─────────────────────────
  "shortName":      "Colar Trevo da Sorte Dourado",                                    // ≤80, clean label for cards/breadcrumbs
  "seoTitle":       "Colar Feminino Dourado com Pingentes Trevo | Brilho de Diva",     // ≤70, page <title>
  "seoDescription": "Colar delicado com pingentes de trevo em aço 316L banhado a ouro. Entrega para todo o Brasil.",   // ≤155, meta description
  "seoKeywords":    ["colar dourado", "trevo da sorte", "aço 316l", "joias femininas"] // ≤12 items, ≤60 chars each
}
```

#### Response (200/201)

```json
{
  "ok": true,
  "result": {
    "productId": "cmnw...",
    "slug": "colar-laco-rose",
    "created": false,
    "variantsCreated": 0,
    "variantsUpdated": 1,
    "variantsDormant": 0,
    "imagesReplaced": 2
  }
}
```

#### Error responses

| Status | Body                                        | Cause                            |
|--------|---------------------------------------------|----------------------------------|
| 400    | `{ ok: false, error: "invalid_json" }`      | Body not valid JSON              |
| 401    | `{ ok: false, error: "..." }`                | Missing / invalid bearer         |
| 403    | `{ ok: false, error: "..." }`                | Server-side key not configured   |
| 422    | `{ ok: false, error: "validation_failed", issues: [...] }` | Zod validation, see `issues` |
| 429    | `{ ok: false, error: "rate_limited", retryAfterMs }` | Rate limit; honor `Retry-After` |
| 500    | `{ ok: false, error: "server_error", message }` | Storefront failure              |

### 4.3 `POST /products` — batch upsert

Send `{ "products": [ ...up to 100... ] }` to upsert multiple in one call. Each product is processed in its own transaction; partial success returns the per-product `result[]`. We recommend batches of ≤25 for predictable latency.

```json
{
  "products": [ { "slug": "...", "name": "...", "variants": [ ... ], ... }, ... ]
}
```

Returns `200` with `{ ok: true, results: [ ... ] }`.

### 4.4 `DELETE /products/{slug}` — soft deactivate

Sets `active = false`. The product disappears from the catalog/sitemap/feed but its variants stay in the DB so historical orders remain intact.

```bash
curl -sS -X DELETE https://loja.brilhodediva.com.br/api/integrations/divahub/products/colar-laco-rose \
  -H "Authorization: Bearer $BRILHODEDIVA_API_KEY"
```

Returns `200` if it was active, `404` if no such active product.

To re-activate, send a new `POST /products` with `"active": true`.

## 5. Behavior contract

### Idempotency
- `POST /products` is keyed by `slug`. Re-sending the same payload is safe (same result, different `updatedAt`).
- We rely on storefront-side dedup; you do **not** need to track our internal `productId`.

### Variants
- SKUs in the payload are upserted by SKU.
- SKUs missing from a re-publish are **not deleted** (would break historical orders); they are set to `stock: 0` ("dormant"). Re-include them in a future payload to restore stock.

### Images
- Replaced wholesale on every publish. We delete all images then insert the payload's array. Order = `position` (0 first), or array index if `position` omitted.

### Categories
- Upserted by `slug`. Never deleted by this API. If you change a product's category, the old one stays in the DB but no products reference it.

### Slugs
- `^[a-z0-9]+(-[a-z0-9]+)*$`, 2..80 chars, immutable. We use the slug in URLs (`/loja/{slug}`), sitemaps, JSON-LD, and the Google Merchant feed.

### Money
- All prices are integer **cents** in BRL. `R$ 189,00` → `priceCents: 18900`. We never use floats.

### Active flag
- `active: false` removes the product from the public catalog. Existing carts that still reference its variants will fail at checkout.

## 6. Observability

Every inbound request creates an `IntegrationRun` row visible at `/admin/integrations` (adapter `divahub_inbound`):

- `ok` — success
- `validation_error` — 422
- `error` — 500 (stack/message in `error` column)
- `noop` — DELETE on a slug that wasn't active

You can poll `/health` from CI; we also expose the storefront's own `/api/health` (no auth) for liveness.

## 7. Sample TypeScript client

A copy-paste-ready client lives at [`divahub-client-sample.ts`](./divahub-client-sample.ts). Drop it into the DivaHub repo, set `BRILHODEDIVA_API_URL` and `BRILHODEDIVA_API_KEY` in DivaHub's env, and call `publishProduct(...)` from your existing publish pipeline.

## 8. Versioning

- This is `v1`. Breaking changes will live under `/api/integrations/divahub/v2/...`.
- Additive changes (new optional fields, new endpoints) won't bump the version. Watch this doc for change notes.

## 9. Contacts

- Storefront repo: `~/brilhodedivasite` (CLAUDE.md / AGENTS.md inside).
- Storefront on-call: tracked via PM2 app `brilhodediva` on port 3001.
- DO NOT call `127.0.0.1:3001` directly from outside the host. Always use the public `https://loja.brilhodediva.com.br/...` URL so nginx terminates TLS and rate limits apply.

## 10. Proposed contract extension — `videos[]`

**Status:** DivaHub is already sending this field on every `POST /products`.
Storefront-side handling is pending the ecom team's implementation. The
field is additive — unknown fields have always been ignored by the Zod
schema, so emitting it is safe even before the storefront consumes it.

### Shape

```ts
interface StorefrontVideo {
  /** External public URL. Prefer YouTube for best marketplace + embed
   *  compatibility; TikTok or Instagram Reel URLs are acceptable fallbacks. */
  url:    string;
  /** Where the URL is hosted — drives UI treatment (embed vs link). */
  source: "youtube" | "tiktok" | "instagram" | "oci";
  /** Source composition type from DivaHub. */
  kind:   "reel" | "story";
}

// On StorefrontProductPayload:
videos?: StorefrontVideo[];   // 0..4
```

### Semantics DivaHub guarantees

- **Order reflects priority.** First element is the "best" video to show
  (reel before story, YouTube before TikTok/Instagram).
- **Idempotent on slug** like the rest of the payload. Re-publishing the
  same job updates the full `videos[]` — same wholesale-replace rule as
  `images[]`.
- **Only approved videos sent.** DivaHub's admin-side "Aprovar vídeo"
  gate (see `lib/workflow/video-approval.ts`) controls which videos
  qualify. Un-approving a video AND the video not being published
  anywhere → it disappears from the next upsert.
- **Never OCI URLs.** DivaHub skips a video whose only URL is the OCI
  pre-signed one (they expire in 7 days) — unless the storefront
  explicitly wants to cache them, in which case DivaHub can be configured
  to send `source: "oci"`. **Not emitted today.**

### Recommended storefront-side behavior

- Store `videos[]` as a `Product.videos` 1:N relation or `Json` column.
- Render on the product page as an embedded YouTube iframe (the most
  common) with a graceful fallback to a link for TikTok/Instagram.
- Feed the first YouTube URL into the Google Merchant feed's
  `video_link` field if Shopping integration exists.
- Not required, but useful: expose `videos[]` back in the internal API
  responses so DivaHub can audit what's live on the storefront.

## 11. SEO hints (optional, non-blocking)

Four optional fields on `StorefrontProductPayload` help the storefront
produce tight titles + meta descriptions without the storefront team
re-parsing DivaHub's marketplace-style long names:

| Field             | Budget             | Purpose / fallback                                                    |
|-------------------|--------------------|-----------------------------------------------------------------------|
| `shortName`       | ≤ 80 chars         | Card / breadcrumb / share label. Storefront falls back to `name`.     |
| `seoTitle`        | ≤ 70 chars         | `<title>` tag. Always includes the brand suffix when room allows.     |
| `seoDescription`  | ≤ 155 chars        | `<meta name="description">`. HTML stripped.                           |
| `seoKeywords`     | ≤ 12 items, ≤ 60 chars each | `<meta name="keywords">` + search-index weighting.               |

### DivaHub's derivation rules

- `shortName` — first clause of the generated-content `title` (splits at
  `— – | • · ,`), clipped to 80 chars at a word boundary.
- `seoTitle` — `"<shortName> | <brand>"`. If the combined string overflows
  70, the **shortName** is cropped first so the brand stays visible.
- `seoDescription` — prefer `generatedContent.shortDescription` → fall
  back to `longDescription` → fall back to the product description.
  Stripped of HTML, collapsed whitespace, clipped to 155 chars at a
  word boundary.
- `seoKeywords` — prefer `generatedContent.keywords`. Augmented with
  derived taxonomy terms (`productType`, `productSubType`,
  `verifiedMaterial`, `brandName`) when generated keywords are thin.
  Deduped, lower-cased, capped at 12.

All fields are **omitted entirely when empty** — storefront should
apply its own fallbacks (truncate `name`, auto-gen description, etc.)
whenever a field is absent. DivaHub will not send an empty string.


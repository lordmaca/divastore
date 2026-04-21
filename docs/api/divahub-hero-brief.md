# DivaHub → Brilho de Diva · Hero Creative Brief + Inbound API

> **Audience:** the DivaHub project (`~/divahub`) — specifically the image
> pipeline (`lib/image/*`) and the post-publish hook that already calls the
> storefront's `/api/integrations/divahub/products` endpoint.
> **Purpose:** add a new `OutputType = "heroCreative"` and push the result
> to the storefront's hero-slide queue so the home page rotates it
> automatically while the linked product is in stock.

Paste this document to the DivaHub team / AI as the spec. Self-contained —
no further clarification needed.

---

## 1. Flow overview

```
 ┌──────────────────────────────┐    ┌──────────────────────────────────┐
 │ DivaHub publishes product    │    │ Storefront — Brilho de Diva      │
 ├──────────────────────────────┤    ├──────────────────────────────────┤
 │ 1. Generate product          │    │ Product upserts (existing)       │
 │ 2. Generate heroCreative     │───▶│ POST /…/home/hero-slide          │
 │    + copy                    │    │  → HeroSlide row (DIVAHUB_AUTO)  │
 │ 3. Upload asset to OCI       │    │  → shown randomly on landing page│
 └──────────────────────────────┘    │  → hidden when stock = 0         │
                                     │  → admin can override copy       │
                                     └──────────────────────────────────┘
```

**Key properties:**

- **Idempotent by `externalId`.** DivaHub calls the endpoint every time a
  product is re-published; the storefront upserts (insert or update) by
  `externalId`.
- **Stock-gated on the storefront side.** The storefront checks
  `Product.active` + sum of `Variant.stock > 0` at render time. DivaHub
  does not need to re-push when stock changes.
- **Admin overrides are preserved across upserts.** The storefront stores
  DivaHub's copy in the base columns and keeps a separate set of
  `*Override` columns that only the admin writes. Re-pushing from DivaHub
  updates the base but never touches the overrides.

---

## 2. Inbound API

### Base URL

```
https://loja.brilhodediva.com.br/api/integrations/divahub
```

### Auth

Same as the existing `/products` endpoint:

```
Authorization: Bearer <DIVAHUB_INBOUND_API_KEY>
```

Missing / invalid → `401`. Server not configured → `403`. Rate limit is
**600 req/min per key** (burst 60).

### `POST /home/hero-slide`

**Request body (JSON):**

```json
{
  "externalId": "divahub-hero-abc123",
  "productExternalId": "divahub-product-456",
  "imageUrl": "https://cdn.brilhodediva.com.br/heros/2026-04/abc123.jpg",
  "imageAlt": "Modelo usando colar de prata com pingente de coração",
  "headline": "Colares que contam histórias",
  "sub": "Feitos à mão em prata 925 — peça única que acompanha você.",
  "ctaLabel": "Ver coleção",
  "ctaUrl": "/loja?categoria=colares",
  "activeFrom": null,
  "activeUntil": null
}
```

**Field contract:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `externalId` | string (1–120) | yes | DivaHub's id. Stable per slide. Keep one slide per product → reuse id across re-publishes. |
| `productExternalId` | string (1–120) | optional | Maps to `Product.externalId` — the slide only shows while that product has stock. Pass `null` / omit for a "campaign" slide not tied to a product. |
| `productId` | string (cuid) | optional | Storefront-native product id. Alternative to `productExternalId`. At most one must be set. |
| `imageUrl` | url, ≤ 2000 chars | yes | Must be publicly GET-able. Prefer CDN URL. Signed URLs with long query strings are OK up to 2k chars. |
| `imageAlt` | string, ≤ 300 chars | optional | pt-BR. Used for a11y + SEO. |
| `headline` | string (1–200) | yes | pt-BR. ≤ 42 chars recommended for overlay legibility. |
| `sub` | string, ≤ 300 chars | optional | pt-BR. ≤ 140 chars recommended. |
| `ctaLabel` | string (1–60) | yes | pt-BR. 1–3 words recommended. |
| `ctaUrl` | string (1–500) | yes | Path, not absolute URL (`/loja`, `/loja?categoria=…`). |
| `activeFrom` | ISO 8601 | optional | Slide hides before this date. |
| `activeUntil` | ISO 8601 | optional | Slide hides after this date. |

**Responses:**

- `200 OK` — `{ "ok": true, "id": "<storefront-cuid>", "externalId": "<same as sent>" }`
- `400` — validation error (`{ ok: false, error: "…" }`)
- `401` — missing/invalid bearer token
- `404` — `product_not_found` when `productId` / `productExternalId` was sent but doesn't resolve
- `429` — rate-limited

### `DELETE /home/hero-slide?externalId=<id>`

Soft-disables a slide (sets `enabled=false`). Does not hard-delete — kept for audit. Safe to call repeatedly.

- `200 OK` — `{ "ok": true, "disabled": "<id>" }` or `{ "ok": true, "already": "absent" }`

---

## 3. When to push

DivaHub should push a hero slide in these cases:

1. **New product published to Brilho de Diva**: generate heroCreative +
   copy, then POST. Re-run generation if the product's images/title/price
   changed significantly.
2. **Re-publish** (e.g., admin edited product in DivaHub): POST with the
   same `externalId` — storefront upserts in place.
3. **Product removed from DivaHub**: call `DELETE /home/hero-slide?externalId=<id>`
   to take the slide off rotation.

DivaHub does NOT need to push when stock changes (the storefront handles
that gate on its side).

---

## 4. Creative specs (unchanged from v1 of this brief)

### 4.1 Output format

| Field | Value |
|---|---|
| Aspect ratio | **16:9** |
| Native resolution | **1920 × 1080 px** |
| Format | JPG (primary) or WebP |
| Color profile | sRGB |
| Target file size | **≤ 400 KB** |
| Minimum resolution | 1600 × 900 px |
| Maximum resolution | 2560 × 1440 px |

### 4.2 Composition

```
 ┌─────────────────────────────────────┐
 │                                     │
 │   ┌──────────────┐                  │
 │   │              │      ┌────────┐  │
 │   │  TEXT SAFE   │      │ PRODUCT │  │
 │   │  ZONE        │      │ FOCAL   │  │
 │   │  (40% left)  │      │ POINT   │  │
 │   │              │      │ (right) │  │
 │   └──────────────┘      └────────┘  │
 │                                     │
 └─────────────────────────────────────┘
   1920 px wide — 1080 px tall
```

- **Left 40%** (0–770 px horizontal) = **text safe zone**. Background must
  be low-contrast enough to accept overlay text. Either:
  (a) soft gradient wash, (b) blurred extension of the main scene, or
  (c) flat brand-palette surface (lavender `#F5EFFE` ↔ pink `#FEE6F2`).
- **Right 60%** (770–1920 px) = **focal subject**. Model + jewelry OR
  product + prop OR lifestyle scene.
- **Vertical center**: the jewelry piece's key detail should sit at 45–55%
  vertical — matches where our overlay button lands.
- **No text in the image.** Text is composited by the storefront.
- **No borders, frames, vignettes, watermarks.**

### 4.3 Mood / lighting / color

- **Lighting**: soft key from top-left, diffused. Avoid hard shadows that
  cross into the text safe zone.
- **Palette**: stay within the brand lavender → rose range in the
  background. Avoid saturated reds or greens (clash with pink CTA).
- **Contrast budget**: luminance of the text safe zone should be either
  ≥ 0.7 (overlay text will be deep pink `#D23A85`) or ≤ 0.3 (overlay text
  will be pure white). Mid-grey backgrounds kill legibility — avoid.

---

## 5. Copy requirements

All copy is in **Brazilian Portuguese (pt-BR)** — non-negotiable. The
storefront's user-facing surfaces are pt-BR only.

| Field | Max chars | Guidance |
|---|---|---|
| `headline` | 200 (stored) / 42 (recommended) | One punchy line. Title case not required. |
| `sub` | 300 (stored) / 140 (recommended) | One sentence. Expands the headline; doesn't repeat it. |
| `ctaLabel` | 60 / 3 words | Imperative verb — "Explorar", "Ver coleção", "Comprar agora". |
| `ctaUrl` | 300 | Path starting with `/`. Common: `/loja`, `/loja?categoria=colares`, `/loja/<slug>`. |
| `imageAlt` | 300 | Literal description. Accessibility + SEO. Required for every slide. |

**Bad examples (don't do):**

- ❌ `headline: "NEW ARRIVALS — SHOP NOW!"` (English)
- ❌ `ctaUrl: "https://loja.brilhodediva.com.br/loja"` (absolute)
- ❌ `imageAlt: "image"` (non-descriptive)
- ❌ headline that repeats the sub verbatim

**Good examples:**

- ✅ `headline: "Sua próxima história começa aqui"`
- ✅ `ctaLabel: "Ver coleção"`, `ctaUrl: "/loja?categoria=colares"`
- ✅ `imageAlt: "Mulher usando colar de prata com corrente fina e pingente de pérola"`

---

## 6. Acceptance checklist

Before marking a heroCreative as ready to POST, DivaHub verifies:

- [ ] Output is exactly 1920 × 1080 px, JPG or WebP, ≤ 400 KB.
- [ ] Left 40% luminance is either ≥ 0.7 or ≤ 0.3.
- [ ] Focal subject sits in the right 60%.
- [ ] No embedded text, watermark, border.
- [ ] `headline` ≤ 42 chars, `sub` ≤ 140 chars, `ctaLabel` ≤ 3 words — all pt-BR.
- [ ] `imageAlt` present, descriptive, pt-BR.
- [ ] Eyeball test: place `[headline, sub, {ctaLabel}]` overlay on left 40%. Still readable? Ship.

---

## 7. Error handling on DivaHub side

| Storefront response | Meaning | DivaHub action |
|---|---|---|
| `401` / `403` | Auth failed | Surface to operator. Rotate key. |
| `404 product_not_found` | `productExternalId` doesn't exist in the storefront | Confirm product was pushed first. Retry after product upsert. |
| `400` + `error` field | Validation failed (dimensions, missing field, bad URL) | Log payload, fix generator, retry. |
| `429` | Rate-limited | Back off with jitter, retry. |
| `5xx` | Storefront issue | Retry with exponential backoff (up to 5 attempts). If still failing, queue locally and retry next publish cycle. |

---

## 8. Relationship to `bannerCreative`

`bannerCreative` stays unchanged for marketplace listings. `heroCreative`
is additive — a new `OutputType` in the same pipeline, with the aspect
ratio, composition prompt, and metadata schema described here. Shared
pipeline code (fidelity check, anchor selection, OCI upload) can be reused.

---

## 9. Testing

Before enabling in production, DivaHub should:

1. Generate a sample heroCreative for a real test product.
2. `curl` the POST with `DIVAHUB_INBOUND_API_KEY`:
   ```bash
   curl -X POST https://loja.brilhodediva.com.br/api/integrations/divahub/home/hero-slide \
     -H "Authorization: Bearer $DIVAHUB_INBOUND_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "externalId": "test-slide-1",
       "productExternalId": "<your-test-product>",
       "imageUrl": "https://.../test.jpg",
       "imageAlt": "teste",
       "headline": "Teste",
       "sub": "Teste de integração",
       "ctaLabel": "Ver",
       "ctaUrl": "/loja"
     }'
   ```
3. Confirm `{ ok: true, id: "...", externalId: "test-slide-1" }`.
4. Check `/admin/configuracoes?tab=home` on the storefront — the slide
   appears under "Hero — fila automática (DivaHub)".
5. Open `/` — the slide should show up (random pick among active slides).
6. Clean up: `curl -X DELETE ".../home/hero-slide?externalId=test-slide-1" -H "Authorization: Bearer …"`.

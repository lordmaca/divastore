# DivaHub → Brilho de Diva · Hero Creative Brief

> **Audience:** the DivaHub project (`~/divahub`) — specifically `lib/image/*`
> and the prompt/output pipeline.
> **Purpose:** add a new `OutputType = "heroCreative"` for storefront landing
> page hero slides. Different from the existing `bannerCreative` (which is
> optimized for marketplace listings).

Paste this document to the DivaHub team / AI as the spec. They should be able
to implement without further clarification.

---

## 1. Why a new output type

The storefront now has a **rotating hero** on the home page ([/admin/configuracoes → Home → Hero rotativo]).
Each slide is a full-bleed photo with overlay text (headline, sub, CTA).
The existing `bannerCreative` is wrong for this because:

1. **Aspect ratio** is different: banner creatives are typically square-ish or
   4:5 (marketplace tile); a hero is landscape 16:9.
2. **Composition**: banner creatives put the product dead-center and fill the
   canvas. A hero needs a **text safe zone** on one side so our overlay
   (h1 + paragraph + CTA button) doesn't compete with product details.
3. **Mood / lighting**: banner uses high-key marketplace light. Hero needs
   editorial lighting with negative space and soft gradients that contrast
   well with white overlay text.

---

## 2. Technical specs

| Field | Value |
|---|---|
| Internal name | `heroCreative` |
| Aspect ratio | **16:9** |
| Native resolution | **1920 × 1080 px** |
| Output format | JPG (primary) or WebP |
| Color profile | sRGB |
| Target file size | **≤ 400 KB** (hero loads on LCP — must be fast) |
| Minimum resolution | 1600 × 900 px |
| Maximum resolution | 2560 × 1440 px |

---

## 3. Composition rules

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

- **Left 40%** (0–770 px horizontal) = **text safe zone**. Background must be
  low-contrast enough to accept white text over it. Either:
  (a) soft gradient wash, or (b) blurred extension of the main scene, or
  (c) flat brand-palette surface (lavender #F5EFFE ↔ pink #FEE6F2).
- **Right 60%** (770–1920 px) = **focal subject**. Model + jewelry OR product
  + prop OR lifestyle scene — whatever the campaign calls for.
- **Vertical center**: focal subject's key detail (jewelry piece) should sit
  at 45–55% vertical — matches where our overlay button lands.
- **No text in the image.** Text is composited over by the storefront.
- **No borders, frames, vignettes.** Full-bleed only.
- **No watermarks.**

## 4. Mood / lighting / color

- **Lighting**: soft key from top-left, diffused. Avoid hard shadows that
  cross into the text safe zone.
- **Palette**: stay within the brand lavender → rose range in the background.
  Product may have its native color (gold, pearl, silver), but avoid saturated
  reds or greens in the background — they clash with our pink overlay CTA.
- **Contrast budget**: luminance of the text safe zone should be one of
  (a) bright 70%+ (then overlay text will be deep pink `#D23A85`) or
  (b) dark 30%– (then overlay text will be pure white).
  Do NOT produce mid-grey backgrounds — overlay text becomes illegible.

## 5. Copy suggestions DivaHub should return

Alongside the image, return a `metadata` JSON with suggested copy the admin
can accept/edit. Keep it optional — admin can override.

```json
{
  "outputType": "heroCreative",
  "imageUrl": "https://…/heros/<id>.jpg",
  "width": 1920,
  "height": 1080,
  "suggestedHeadline": "Colares que contam histórias",
  "suggestedSub": "Feitos à mão em prata 925 — peça única que acompanha você.",
  "suggestedCta": { "label": "Ver coleção", "url": "/loja?categoria=colares" },
  "imageAlt": "Modelo usando colar de prata com pingente de coração",
  "palette": { "background": "#F5EFFE", "overlayText": "#D23A85" }
}
```

**Copy constraints:**

- `suggestedHeadline`: ≤ 42 characters. Title case not required (pt-BR casing).
- `suggestedSub`: ≤ 140 characters, 1 sentence.
- `suggestedCta.label`: 1–3 words. Imperative verb recommended ("Explorar",
  "Ver coleção", "Comprar agora").
- `suggestedCta.url`: path only (`/loja`, `/loja?categoria=X`) — no absolute
  URLs.
- `imageAlt`: literal description of what's in the image, in pt-BR — used for
  accessibility + SEO. Required.

All copy in **Brazilian Portuguese (pt-BR)**. This is non-negotiable — the
storefront's user-facing surfaces are pt-BR only.

## 6. Delivery

Two supported flows:

### 6.1 Standalone upload (preferred for now)

DivaHub stores the image in its own S3 bucket under `heros/<yyyy-mm>/<id>.jpg`
and returns the metadata JSON (section 5) to its admin UI. The Brilho de Diva
admin copy-pastes the URL + copy into `/admin/configuracoes → Home → Hero
rotativo`.

### 6.2 Push via storefront API (future)

When DivaHub is ready to push directly, use:

```
POST https://loja.brilhodediva.com.br/api/integrations/divahub/home/hero-slide
Authorization: Bearer <DIVAHUB_INBOUND_API_KEY>
Content-Type: application/json

{
  "id": "<stable slide id>",
  "imageUrl": "…",
  "imageAlt": "…",
  "headline": "…",
  "sub": "…",
  "ctaLabel": "…",
  "ctaUrl": "…",
  "activeFrom": "2026-05-01T00:00:00Z",
  "activeUntil": "2026-05-31T23:59:59Z"
}
```

The storefront will append (idempotent by `id`) into `SettingsKv.home.heroSlides`.
**This endpoint does not exist yet** — build it when flow 6.2 is needed.

## 7. Acceptance checklist

Before shipping a hero creative, DivaHub verifies:

- [ ] Output is exactly 1920 × 1080 px, JPG or WebP, ≤ 400 KB.
- [ ] Left 40% luminance is either ≥ 0.7 or ≤ 0.3 (measured on the text safe zone).
- [ ] Focal subject sits in the right 60%.
- [ ] No embedded text, watermark, border.
- [ ] Metadata JSON validates against section 5 (headline ≤ 42 chars, sub ≤ 140, pt-BR).
- [ ] `imageAlt` is present and descriptive.
- [ ] Manual eyeball test: place "Realce sua Beleza, Brilhe como uma Diva! — [Explorar coleção]" over the left 40%. Still readable? Ship. Not readable? Regenerate with higher contrast.

## 8. Backwards compatibility with `bannerCreative`

`bannerCreative` stays as-is for marketplace use. `heroCreative` is additive.
Shared pipeline code (fidelity check, anchor selection, upload) can be reused —
only the aspect ratio, composition prompt, and metadata schema change.

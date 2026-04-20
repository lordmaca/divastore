# Category hygiene — name-driven classifier + admin review queue

## Context

A quick `psql` sample just showed the problem is real: a "Colar ... Pingentes Trevo" is in **Beleza**, a "Brinco Argola Elegante" is in **Beleza**, and a "Colar Feminino Pingente Gota" is in **Brincos**. The categorization is drifting because catalog entries come from multiple sources (admin, DivaHub imports) and nobody re-checks.

Consequence: the **/loja** category filters show the wrong products, shoppers browsing "Colares" don't see half the colares, and the SEO per-category landing pages (`/loja?category=colares`) look inconsistent.

## Goal

A background process that:
1. **Detects** mis-categorized products by scoring the product name against a per-category rules registry (pt-BR jewelry terms).
2. **Flags** mismatches as admin-reviewable issues — no silent writes by default.
3. **Optionally auto-applies** the suggested category when the confidence is high and the admin has opted in.
4. Runs on a cron, after imports, and on demand via `bdd`.

Everything deterministic, pt-BR rule-based, fully explainable from the admin UI. No LLM cost, no dependency, no black box.

## Architecture

```
Products
   │
   ├── name text
   │
   ▼
lib/catalog/category-classifier.ts
   ├── loads rules from SettingsKv ("catalog.categoryRules")
   ├── scores name against each category's regex patterns
   └── returns { suggestedSlug, confidence, matches[] }
                │
                ▼
scripts/scan-categories.ts (or bdd categorize-scan)
   │
   ├── for each active product
   │     compare suggested vs current
   │     if mismatch → upsert CategoryAuditIssue (unresolved)
   │     if match    → resolve any open issue for that product
   │
   └── writes IntegrationRun(adapter=catalog, operation=category.scan)
```

Admin workflow:
- `/admin/produtos/categorias` lists unresolved `CategoryAuditIssue` rows
- Per-row actions: **Aplicar sugestão** (updates Product.categoryId) · **Dispensar** (keeps current, flags reason) · **Abrir produto** (deep link to admin product detail)
- Bulk action: **Aplicar todas as de alta confiança** — one-click fix for the obvious cases

Trigger points:
- PM2 cron `brilhodediva-category-scan` (daily 04:00 BRT)
- After DivaHub product upsert (call `scanProduct(productId)` inline)
- Manual: `./scripts/bdd categorize-scan`, `./scripts/bdd categorize-apply` (applies all high-confidence unresolved)

## 1. Schema

```prisma
enum CategoryIssueStatus {
  OPEN         // pending admin review
  RESOLVED     // admin applied the suggestion (or product was re-categorized by other means)
  DISMISSED    // admin chose to keep the current category
  AUTO_APPLIED // threshold met + auto-apply toggle on
}

model CategoryAuditIssue {
  id                 String              @id @default(cuid())
  productId          String
  product            Product             @relation(fields: [productId], references: [id], onDelete: Cascade)
  currentCategoryId  String?
  suggestedCategoryId String?
  // Confidence bucket derived from score-gap between best and second-best match.
  confidence         String              // "high" | "medium" | "low"
  // Structured detail: { score, secondBest, matches: [{ categorySlug, pattern, weight }] }
  evidence           Json
  status             CategoryIssueStatus @default(OPEN)
  resolvedBy         String?
  resolvedAt         DateTime?
  dismissalReason    String?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  @@unique([productId])   // one open issue per product max; updates in place
  @@index([status, createdAt])
  @@index([confidence, status])
}
```

One issue per product, updated in place on every scan. When the admin applies a suggestion, we set `status=RESOLVED` and move on; on the next scan, if the name still drifts, we reopen with updated evidence.

## 2. Classifier — `lib/catalog/category-classifier.ts`

Pure function:

```ts
classifyProductName(name: string, rules: CategoryRuleSet): ClassifyResult
```

Where `CategoryRuleSet` is stored in `SettingsKv` at `catalog.categoryRules`:

```ts
{
  rules: [
    { categorySlug: "colares",   patterns: [
      { regex: "\\b(colares?|gargantilha|choker)\\b", weight: 10 },
      { regex: "\\bcorrente\\b", weight: 8 },
    ]},
    { categorySlug: "brincos",   patterns: [
      { regex: "\\bbrinco(s)?\\b", weight: 10 },
      { regex: "\\bargola(s)?\\b", weight: 6 },
    ]},
    { categorySlug: "aneis",     patterns: [
      { regex: "\\b(aneis|anel|an[eé]is)\\b", weight: 10 },
    ]},
    { categorySlug: "pulseiras", patterns: [
      { regex: "\\b(pulseira(s)?|bracelete|bangle)\\b", weight: 10 },
    ]},
  ],
  // Categories the classifier will NEVER suggest (leave as-is). Useful for
  // intentionally-broad buckets like "Beleza" or "Testes".
  excludeFromSuggestions: ["beleza", "testes"],
  // When the best score is zero (no rule matched), do we suggest nothing or
  // flag for review? Default: nothing — unclassifiable products stay put.
  minScoreToSuggest: 6,
  // Confidence buckets keyed on the score gap between best and second-best.
  confidence: {
    high: 8,      // gap >= 8
    medium: 4,    // gap >= 4
  },
}
```

Seed the default rules on first run if the setting is empty. Rules are admin-editable at `/admin/configuracoes` via JSON textarea (same pattern as other SettingsKv entries).

Result shape:

```ts
{
  suggestedSlug: "colares" | null,
  suggestedCategoryId: "cmxxx..." | null,  // resolved by the caller
  confidence: "high" | "medium" | "low" | null,
  score: 10,
  secondBest: { slug: "brincos", score: 2 } | null,
  matches: [{ pattern: "\\bcolar(es)?\\b", weight: 10, categorySlug: "colares" }],
}
```

## 3. Scan orchestrator — `lib/catalog/scan.ts`

```ts
scanProduct(productId): ScanOutcome    // upserts one issue or resolves existing
scanAllProducts(): { scanned, opened, resolved, dismissed }
```

Fires from:
- Cron (daily)
- DivaHub upsert (`lib/integration/divahub/upsert.ts`) — after `product.create/update`, call `scanProduct(p.id)` fire-and-forget
- Admin "scan now" button
- CLI

All roads write an `IntegrationRun(adapter=catalog, operation=category.scan)` with counts.

## 4. Cron — PM2 entry

```js
{
  name: "brilhodediva-category-scan",
  cwd: "/home/ubuntu/brilhodedivasite",
  script: "node_modules/.bin/tsx",
  args: "scripts/scan-categories.ts",
  autorestart: false,
  cron_restart: "0 7 * * *",   // 04:00 BRT daily
  env: { NODE_ENV: "production" },
  node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
  out_file: "/home/ubuntu/brilhodedivasite/logs/category-scan-out.log",
  error_file: "/home/ubuntu/brilhodedivasite/logs/category-scan-err.log",
  time: true,
},
```

`bdd bootstrap` picks it up automatically on next run.

## 5. Admin UI — `/admin/produtos/categorias`

Dedicated page:
- Badge on the admin nav when issues > 0 (red pill with count)
- Filters: confidence (high/medium/low), status (OPEN default)
- Per-row:
  - Product name + current image thumb
  - **Atual:** <Badge category="Beleza" />
  - **Sugestão:** <Badge category="Colares" /> · confidence: high
  - Evidence toggle: shows which regex patterns matched, with scores
  - Actions: **Aplicar sugestão** · **Dispensar** (prompt for reason) · **Abrir produto**
- Bulk: **Aplicar todas as sugestões de alta confiança** — one click, fires `applyAllHighConfidence()` which updates every product with confidence=high in one transaction + emits an audit row

## 6. Settings

- `catalog.categoryRules` — the rule registry (seeded on first use)
- `catalog.autoApplyHighConfidence` — boolean, default `false`. When on, high-confidence mismatches are auto-applied without waiting for admin review (still recorded as `AUTO_APPLIED` for audit).

## 7. `bdd` CLI

```
categorize-scan        Scan all active products; print counts
categorize-scan --dry  Same but don't write CategoryAuditIssue rows
categorize-apply       Apply all OPEN issues with confidence=high
categorize-issues [n]  List last N OPEN issues
```

## 8. Files

| File | Action |
|---|---|
| [prisma/schema.prisma](../../prisma/schema.prisma) | +`CategoryAuditIssue`, +`CategoryIssueStatus` |
| **new** `lib/catalog/category-classifier.ts` | pure rule-based classifier |
| **new** `lib/catalog/scan.ts` | scanProduct / scanAllProducts orchestrator |
| **new** `lib/catalog/defaults.ts` | seed rule set loaded on empty setting |
| [lib/settings.ts](../../lib/settings.ts) | +`catalog.categoryRules`, +`catalog.autoApplyHighConfidence` |
| **new** `scripts/scan-categories.ts` | PM2 cron entry |
| [ecosystem.config.js](../../ecosystem.config.js) | +`brilhodediva-category-scan` |
| **new** `app/admin/produtos/categorias/page.tsx` | review queue |
| **new** `components/admin/CategoryIssueRow.tsx` | client row with apply/dismiss |
| [lib/admin-actions.ts](../../lib/admin-actions.ts) | +applyCategorySuggestion, +dismissCategoryIssue, +applyAllHighConfidence |
| [lib/integration/divahub/upsert.ts](../../lib/integration/divahub/upsert.ts) | call `scanProduct(p.id)` after create/update |
| [scripts/bdd](../../scripts/bdd) | +categorize-scan, +categorize-apply, +categorize-issues |

## 9. Decisions to pin before coding

1. **Default mode**: flag-only (recommended) vs auto-apply high-confidence from day one. I recommend **flag-only**, with the toggle available in settings, so the team reviews the first batch and adjusts rules before auto-apply goes live.
2. **"Beleza" disposition**: treat it as the catch-all unclassifiable bucket (exclude from suggestions) vs retire it. I recommend **exclude from suggestions** — admins can still manually assign it, and it stays the bucket for products that don't match any rule.
3. **Scan cadence**: daily (my default) vs hourly vs only after imports. Daily is right for a boutique catalog; hourly is overkill; after-imports-only misses admin edits. Daily + after-imports is the sweet spot and what I've drafted.

## 10. Verification

1. `bdd migrate add_category_audit` (schema + enum)
2. Populate default rules: first `bdd categorize-scan --dry` call seeds `catalog.categoryRules` if empty
3. `bdd categorize-scan` → writes issues; admin queue shows the real drift we just sampled (Colar in Beleza, Colar in Brincos, etc.)
4. Spot-check: open `/admin/produtos/categorias` → verify the 13 products above would be flagged correctly
5. Bulk-apply the high-confidence ones → recheck the sample query returns Colar→Colares, Brinco→Brincos, etc.
6. `./scripts/bdd deploy` + DivaHub safe harbor check

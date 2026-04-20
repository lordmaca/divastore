# Category hygiene — progress

**Strategic plan:** [category-hygiene.md](category-hygiene.md)

**Status:** ✅ **SHIPPED** 2026-04-19 · deployed + DivaHub safe + initial scan run against live catalog.

**Phase goal:** Detect mis-categorized products by scoring the product name against a per-category rules registry. High-confidence mismatches are auto-applied (user decision 2026-04-18); medium/low become admin-reviewable issues.

**Decisions pinned 2026-04-18:**
- **Auto-apply from day one** — `catalog.autoApplyHighConfidence` ships `true`.
- **Keep Beleza** as the catch-all bucket; classifier never suggests moving a product *into* it.

---

## Checklist

### Foundation
- [x] **1.1** Schema: `CategoryAuditIssue` + `CategoryIssueStatus` enum (OPEN/RESOLVED/DISMISSED/AUTO_APPLIED) + Product back-relation
- [x] **1.2** Migration `20260419174938_add_category_audit`

### Classifier + settings
- [x] **1.3** [lib/catalog/defaults.ts](../../lib/catalog/defaults.ts) — pt-BR rule set for Colares / Brincos / Anéis / Pulseiras (+ synonyms: gargantilha, choker, corrente, argola, ear cuff, aliança, solitário, bracelete, bangle, tornozeleira). Beleza + Testes in `excludeFromSuggestions`.
- [x] **1.4** [lib/catalog/category-classifier.ts](../../lib/catalog/category-classifier.ts) — pure `classifyProductName(name, rules)`; compiled-regex cache; confidence derived from score gap (high ≥ 8, medium ≥ 4)
- [x] **1.5** `catalog.categoryRules` + `catalog.autoApplyHighConfidence` in [lib/settings.ts](../../lib/settings.ts); rules default to `DEFAULT_CATEGORY_RULES` so `getSetting` returns them until an admin overrides via /admin/configuracoes

### Orchestrator
- [x] **1.6** [lib/catalog/scan.ts](../../lib/catalog/scan.ts) — `scanProduct` (per-product) + `scanAllProducts` (catalog-wide) + `applyAllHighConfidenceIssues` (bulk admin action). Writes IntegrationRun on every scan pass.
- [x] **1.7** [lib/integration/divahub/upsert.ts](../../lib/integration/divahub/upsert.ts) calls `scanProduct(p.id)` fire-and-forget after every DivaHub product create/update

### Cron
- [x] **1.8** `brilhodediva-category-scan` cron `0 7 * * *` (04:00 BRT daily) in [ecosystem.config.js](../../ecosystem.config.js); added to bdd apps list; `./scripts/bdd bootstrap` registered it

### Admin UI
- [x] **1.9** [/admin/produtos/categorias](../../app/admin/produtos/categorias/page.tsx) — review queue with status counters, confidence filters (alta/média/baixa), per-row apply/dismiss, bulk "Aplicar todas de alta confiança" button, live "Rodar scan agora"
- [x] **1.10** [lib/admin-actions.ts](../../lib/admin-actions.ts): `runCategoryScanAction`, `applyCategorySuggestionAction`, `dismissCategoryIssueAction`, `applyAllHighConfidenceAction`

### CLI
- [x] **1.11** `bdd categorize-scan [--dry]`, `bdd categorize-apply`, `bdd categorize-issues [n]`

### Ship
- [x] **1.12** Typecheck clean; deploy green; DivaHub 307; **initial scan against live catalog: 13 products → 10 auto-applied, 2 opened, 1 no suggestion**

---

## Initial-scan results (2026-04-19)

Before the scan, the sample looked like:
```
Colar Feminino ...               → Beleza    ❌
Brinco Argola Elegante ...       → Beleza    ❌
Pulseira Folheada Pingente ...   → Beleza    ❌
Colar Feminino Pingente Gota ... → Brincos   ❌
```

After one scan pass, every active product sits in the right bucket **except** two Pulseira products whose names also contain "Pingente" (a colar-signal word). Those are classified as MEDIUM confidence (score gap of 6) and landed in `/admin/produtos/categorias` for a human to confirm. Expected behavior — the classifier was right to hedge.

---

## Notes / decisions during implementation

- **Removed `import "server-only"` from scan/delete/events modules** — the package throws on plain-Node tsx scripts because they lack the `react-server` export condition. Client-bundle protection already comes from the pure-constants split (`lib/orders.ts` stays free of Prisma imports). Over-belting broke the CLI.
- **`currentCategoryId: null` allowed in Create** — the Prisma types were strict about the `previousCategoryId` being potentially null. Explicit `?? null` coalescence in the orchestrator fixes the inference without changing behavior.
- **Confidence is stored as `String`**, not an enum, because the rule set can introduce new confidence buckets without a migration (admins may want "very_high" later).
- **Score-gap confidence beats absolute-score confidence** — a product with score 10 and runner-up 4 is much cleaner signal than a product with score 10 and runner-up 9. Gap-based keeps the classifier honest.
- **"Pingente" weight 4 (for Colares)** is deliberately low so Pulseira-with-Pingente products end up MEDIUM instead of HIGH — they genuinely need human review.
- **`excludeFromSuggestions: ["beleza", "testes"]`** prevents the classifier from pushing products INTO Beleza (catch-all) or Testes (sandbox). They stay as-is until a name explicitly matches another category.
- **Auto-apply writes to the same CategoryAuditIssue row** it would have opened for admin review, just with `status=AUTO_APPLIED` and `resolvedBy="cron:category-scan"`. The audit trail is identical for both paths; the admin page's "Auto-aplicadas" counter shows the activity.

---

## Future extensions (not in scope)

- **LLM fallback** for low-confidence cases — call an AI model when rules-based returns score 0 or tied categories.
- **Category-from-description** — right now only `name` is scored. Some products have more specific wording in `description` that could resolve ambiguities.
- **Per-category exclusion patterns** — e.g. "colar" pattern excludes "porta-colares" to avoid false positives on display accessories.
- **Webhook to admin's Slack on medium-confidence issues** — piggyback on the Notification infrastructure from the orders overhaul.

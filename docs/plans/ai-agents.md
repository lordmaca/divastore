# Brilho de Diva — AI Agents area (future phases)

> **Note:** Phase A (admin shortcut in the header) was executed separately.
> This document keeps Phases B–D for when we come back to build the AI agents
> area and the Market Intelligence agent. The full plan including Phase A lives
> in `~/.claude/plans/streamed-riding-tiger.md` at the time it was approved.

## Context

Today the storefront has no AI-agent surface. We want to start with a
**Market Intelligence agent** that watches Brazilian marketplaces (starting
with Mercado Livre) for cheap/steel jewelry, learns what sells + how it's
titled + how it's priced, builds a knowledge base that grows every day, and
hands the admin **advisory-only** insights to act on. More agents can slot in
later (content polisher, abandoned-cart writer, SEO auditor).

**Decisions confirmed with the user:**
1. **Sources (MVP)** — **Mercado Livre only**, via the public `api.mercadolibre.com/sites/MLB/search` endpoint. Free, no auth, ToS-compliant. Shopee/Shein/Amazon BR land in later phases.
2. **Autonomy** — **Advisory only**. Agent ranks insights; admin reviews + approves. No auto-edits to Product / Variant / price / SEO.
3. **LLM budget** — **Lean, ≤ ~US$ 15/month**. One daily run, one weekly deep-dive. Prompt caching + summaries over raw listings.

---

## Phase B — Agents area foundation

**Goal:** schema + list page so more agents can slot in cleanly.

### B.1 Schema (one migration — use the `migrate` skill)

```prisma
enum AgentKind {
  MARKET_INTELLIGENCE
  // CONTENT_POLISH, SEO_AUDIT, ABANDONED_CART … future
}

model Agent {
  id          String    @id @default(cuid())
  kind        AgentKind @unique           // one instance per kind for now
  name        String                      // "Inteligência de Mercado"
  enabled     Boolean   @default(true)
  config      Json                        // agent-specific (queries, caps, etc.)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  runs        AgentRun[]
  insights    AgentInsight[]
  knowledge   AgentKnowledge[]
}

model AgentRun {
  id         String   @id @default(cuid())
  agentId    String
  agent      Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  trigger    String                          // "cron" | "manual" | "retry"
  status     String                          // "running" | "ok" | "error" | "skipped_over_budget"
  startedAt  DateTime @default(now())
  finishedAt DateTime?
  durationMs Int?
  error      String?
  stats      Json?                           // observations fetched, insights produced, $ spent
  @@index([agentId, startedAt])
}

model AgentInsight {
  id           String    @id @default(cuid())
  agentId      String
  agent        Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  runId        String?
  title        String                         // one-liner
  body         String                         // markdown, LLM output
  category     String                         // "pricing" | "seo" | "product_gap" | "trend"
  priority     Int       @default(3)          // 1 = urgent, 5 = FYI
  evidence     Json                           // links, prices, counts
  status       String    @default("NEW")      // "NEW" | "ACTED" | "DISMISSED"
  createdAt    DateTime  @default(now())
  resolvedAt   DateTime?
  resolvedBy   String?                        // Customer.id of admin
  @@index([agentId, status, createdAt])
}

model AgentKnowledge {
  id         String   @id @default(cuid())
  agentId    String
  agent      Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  topic      String                         // "trending_keywords" | "competitor_price_bands" | …
  summary    String                         // short, Claude-distilled
  evidence   Json                           // raw supporting samples (pruned)
  confidence Float    @default(0.5)         // 0..1
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@unique([agentId, topic])
}

model MarketObservation {
  id          String   @id @default(cuid())
  source      String                         // "mercadolivre"
  query       String                         // the search term used
  externalId  String                         // ML item id "MLB1234567890"
  title       String
  priceCents  Int
  url         String
  attributes  Json                           // condition, free_shipping, seller_reputation, sold_quantity, etc.
  capturedAt  DateTime @default(now())
  @@index([source, externalId, capturedAt])
  @@index([query, capturedAt])
}

model MarketPricePoint {
  id          String   @id @default(cuid())
  source      String
  externalId  String
  priceCents  Int
  capturedAt  DateTime @default(now())
  @@index([source, externalId, capturedAt])
}
```

### B.2 Admin sidebar + list page
- `app/admin/layout.tsx` — add **Agentes** link right after Integration Center.
- `app/admin/agents/page.tsx` — cards per configured agent: status badge, last-run timestamp + duration, insight counts (NEW / ACTED / DISMISSED), "Executar agora" button, "Ver detalhes" link.
- `app/admin/agents/[kind]/page.tsx` — per-agent detail. Sections: Config, Últimos runs, Insights, Base de conhecimento.

### B.3 Action layer
- `lib/agents/actions.ts` — `requireAdmin()`-gated:
  - `runAgentNow(kind)` — enqueues an in-process run, returns final stats.
  - `resolveInsight(id, action: "acted" | "dismissed", note?)` — marks status + stores resolver.
  - `upsertAgentConfig(kind, config)` — writes `Agent.config` JSON (validated per-kind).

### B.4 Settings additions (`lib/settings.ts`)
- `agents.enabled` — master kill switch (boolean, default true).
- `agents.anthropic.modelDaily` — e.g. `"claude-haiku-4-5-20251001"` (cheap daily pass).
- `agents.anthropic.modelWeekly` — e.g. `"claude-sonnet-4-6"` (deeper weekly).
- `agents.anthropic.monthlyBudgetCents` — `1500` (US$ 15) default.

### Env
- `ANTHROPIC_API_KEY=` added to `.env.local` (user provides).

### Verification (Phase B)
1. `migrate` skill applies cleanly.
2. `/admin/agents` renders with the Market Intelligence card, status = disabled until API key set.
3. Add key → reload PM2 → "Executar agora" button becomes active.

---

## Phase C — Market Intelligence agent (MVP)

**Goal:** end-to-end pipeline that runs daily, gathers ML listings for our target categories, analyzes them with Claude, produces insights, and grows the knowledge base.

### C.1 Pipeline

`scripts/agent-market-intelligence.ts` — mirrors `scripts/rollup-metrics.ts`:

1. **Load config** from `Agent.config`:
   ```json
   {
     "queries": [
       "colar aço inoxidável feminino",
       "brinco aço inoxidável",
       "anel aço inoxidável feminino",
       "colar trevo aço",
       "bijuteria aço inoxidável dourada"
     ],
     "resultsPerQuery": 40,
     "maxPriceCents": 15000
   }
   ```
2. **Budget preflight** — sum `AgentRun.stats.costCents` for the current month; refuse if ≥ `agents.anthropic.monthlyBudgetCents`; write `AgentRun.status = "skipped_over_budget"`.
3. **Fetch** each query from `https://api.mercadolibre.com/sites/MLB/search?q=<q>&limit=<N>` — public, no auth, respect 10-req/sec soft cap. Log one `IntegrationRun` per HTTP call.
4. **Persist raw** in `MarketObservation` + price point per item.
5. **Normalize** — deduplicate by `externalId`, compute per-query aggregates (median price, IQR, top 10 titles, most-sold).
6. **Analyze with Claude** (`@anthropic-ai/sdk` + prompt caching):
   - **Cached preamble** (5-min cache):
     - Our current catalog summary (slug + shortName + first variant price).
     - Current `AgentKnowledge` rows serialized as bullets.
     - Agent constitution ("You are an advisory market-intelligence analyst for a pt-BR jewelry DTC. Output only actionable insights in pt-BR. Never fabricate data; cite ML item IDs. Advisory only — never instruct auto-changes.").
   - **Fresh tail**: today's aggregates + notable price movements.
   - **Output** (Zod-validated structured JSON):
     ```ts
     { insights: Array<{
         category: "pricing" | "seo" | "product_gap" | "trend";
         priority: 1|2|3|4|5;
         title: string;   // pt-BR, ≤80 chars
         body: string;    // markdown, ≤600 chars
         evidence: Array<{ label: string; url?: string; value?: string }>;
       }>;
       knowledgeUpdates: Array<{
         topic: string;
         summary: string;           // ≤200 chars
         confidenceDelta: number;   // −0.3 .. +0.3
         evidenceSamples: string[]; // ML item ids
       }>;
     }
     ```
7. **Persist insights & knowledge** — `AgentInsight.create` for each; `AgentKnowledge` upsert by `(agentId, topic)` with clamped 0..1 confidence.
8. **Close the run** — `AgentRun.finish` with `stats: { observations, insights, costCents }` from Anthropic SDK usage.

### C.2 Models (lean budget)

- **Daily pass** → `claude-haiku-4-5-20251001` with prompt caching. ~US$ 0.30 per run.
- **Weekly deep-dive** (Sundays) → `claude-sonnet-4-6`. ~US$ 2 per run.
- Monthly cap **US$ 15** → fits 30 daily + 4 weekly with headroom.

### C.3 Cron

`ecosystem.config.js` new PM2 app `brilhodediva-market-agent`:
```js
{
  name: "brilhodediva-market-agent",
  cwd: "/home/ubuntu/brilhodedivasite",
  script: "node_modules/.bin/tsx",
  args: "scripts/agent-market-intelligence.ts",
  autorestart: false,
  cron_restart: "30 6 * * *",  // daily 03:30 BRT (after rollup)
  node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
  out_file: "logs/agent-out.log",
  error_file: "logs/agent-err.log",
  time: true,
}
```

### C.4 Admin UX — `/admin/agents/market-intelligence`

Tabs:
- **Visão geral** — today's summary card, MTD cost vs cap, next-run timestamp, "Executar agora".
- **Insights** — feed of `AgentInsight`: priority pill, category badge, title, markdown body, evidence links. Actions: **Marcar como agido**, **Descartar**, **Ver produtos** (links when insight mentions our SKU).
- **Base de conhecimento** — `AgentKnowledge` rows sorted by confidence desc. Topic + summary + confidence bar + last-updated. Read-only.
- **Configuração** — edit queries/caps/budget via typed settings widgets.
- **Runs** — paginated list with duration, observation count, cost, status.

### C.5 Seed
`prisma/seed.ts` creates one `Agent` row with `kind: MARKET_INTELLIGENCE` and default config. Idempotent on `kind` (unique).

### Verification (Phase C)
1. Click "Executar agora" → run completes in < 60s.
2. `AgentRun.status = ok`, `MarketObservation` ≥ 100 rows, `AgentInsight` ≥ 3 rows, `AgentKnowledge` ≥ 1 row.
3. Second run shows cached-input tokens (SDK telemetry).
4. MTD cost visible on overview card.
5. DivaHub still 307.

---

## Phase D — Learning loop (growing-smarter-every-day)

**Goal:** admin feedback tightens future recommendations without hand-coded rules.

1. Admin **dismisses** an insight → write `AgentKnowledge` with `topic = "dismissed-${category}"` + insight summary + `confidence = -0.2`. Next run's preamble includes "avoid saying things like…".
2. Admin **acts** on an insight → matching `AgentKnowledge` gets `confidence += 0.15`; category gets priority boost next run.
3. Knowledge-base pruning — quarterly pass deletes rows with `confidence < 0.1` AND `updatedAt < 90d`.
4. Agent's **constitution** always includes: top 5 highest-confidence knowledge rows + 5 most-recently-dismissed patterns. This is the "memory" that compounds.

### Verification (Phase D)
- Dismiss 3 insights → next run shows reduced volume in that category.
- Act on an insight → follow-up run references the knowledge row verbatim.

---

## Critical files

**New**
- `prisma/migrations/<ts>_agents/migration.sql`
- `app/admin/agents/page.tsx`
- `app/admin/agents/[kind]/page.tsx`
- `app/admin/agents/[kind]/_tabs/{Overview,Insights,Knowledge,Config,Runs}.tsx`
- `lib/agents/actions.ts`
- `lib/agents/types.ts`
- `lib/agents/market-intelligence/{planner,fetcher,analyzer,cost}.ts`
- `scripts/agent-market-intelligence.ts`

**Modified**
- `prisma/schema.prisma` — 5 new models + 1 enum
- `lib/settings.ts` — `agents.*` keys
- `app/admin/layout.tsx` — add "Agentes" link
- `prisma/seed.ts` — seed Market Intelligence agent row
- `ecosystem.config.js` — new `brilhodediva-market-agent` cron
- `.env.local` template — `ANTHROPIC_API_KEY`
- `package.json` — add `@anthropic-ai/sdk`

**Reused as-is**
- `lib/admin.ts` `requireAdmin()`
- `lib/rate-limit.ts`
- `lib/settings.ts` typed get/set + LRU cache
- PM2 cron pattern from `scripts/rollup-metrics.ts`
- `IntegrationRun` logging pattern for ML HTTP calls
- `.claude/skills/migrate`, `.claude/skills/deploy`

---

## Subagent owners

- `architect` — `Agent` / `AgentRun` / knowledge-loop invariants, cost guard.
- `claude-api` skill — prompt-cached invocation, structured output, telemetry.
- `ecommerce-strategist` — which insight categories matter + priority cutoffs.
- `seo-specialist` — reviewing the "seo" insight category output quality.
- `security-reviewer` — admin gating on all `AgentInsight` actions, prompt-injection guard (never execute LLM output; always Zod-validate).
- `ui-designer` — `/admin/agents` feed layout.
- `qa-e2e` — Playwright: login as admin → open Agentes → run agent → see insights.

---

## Safe Harbor

- No writes to `/home/ubuntu/divahub/` or its PM2 apps or its nginx.
- Scrape only ML's public search endpoint. Never exceed 10 req/sec. Never persist PII from other marketplaces. Never re-host images from ML (link only). Respect robots.txt for future sources.
- Agent is **advisory only** — never auto-mutates Product / Variant / price / SEO fields. Every action is admin-approved.
- LLM output validated with Zod before any DB write; prompt-injection attempts in titles/descriptions cannot alter our schema.
- Monthly budget enforced **before** the run calls Anthropic (refuses + logs to `AgentRun.status = "skipped_over_budget"`).
- Private data (invoices, customer PII exports) is never included in the agent preamble.

---

## End-to-end verification

1. `npm run build` clean. `migrate` skill applies schema.
2. `deploy` skill reloads PM2; DivaHub still 307.
3. As admin: gear icon → Agentes → "Executar agora" → status `ok` in ≤ 60s.
4. Insights tab shows ≥ 3 markdown cards with priority + evidence links.
5. Knowledge tab shows ≥ 1 topic row. Run again → confidence bar updates.
6. Month-to-date cost ≤ US$ 1 after the first run.
7. Dismiss 2 insights → next daily run reflects the dismissal.

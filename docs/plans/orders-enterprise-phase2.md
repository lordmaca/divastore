# Orders enterprise overhaul — Phase 2 progress

**Strategic plan:** [orders-enterprise.md](orders-enterprise.md) · **Previous phase:** [phase 1](orders-enterprise-phase1.md)

**Status:** ✅ **SHIPPED** 2026-04-18 · deployed + DivaHub safe + new `brilhodediva-invoice-poll` cron registered.

**Phase goal:** Tiny ERP emits the NF-e on our behalf after payment approval. Our system requests emission, polls for the result, and surfaces the DANFE PDF + XML to admin and customer. We never build a fiscal document locally — Tiny is the system of record.

---

## Checklist

### Foundation
- [x] **2.1** Schema: `Invoice` model (with `providerInvoiceId`, `number/serie/accessKey`, `xmlUrl/danfeUrl`, `issuedAt/cancelledAt`, `cancellationReason`, `lastError`, `attempts`), `InvoiceStatus` enum, Order back-relation
- [x] **2.2** Migration `20260418020825_add_invoices` applied

### Tiny adapter
- [x] **2.3** [lib/integration/tiny/invoices.ts](../../lib/integration/tiny/invoices.ts) — `tinyEmitirNotaFiscal`, `tinyObterNotaFiscal`, `tinyCancelarNotaFiscal`; response-shape tolerant (`chave_acesso`~`chaveAcesso`, `link_danfe`~`linkDanfe`~`link`); `mapTinySituacao` normalizer

### Issuance orchestration
- [x] **2.4** [lib/invoices.ts](../../lib/invoices.ts) — `issueInvoice` / `reconcileInvoice` / `cancelInvoice` / `sweepPendingInvoices`; idempotent (reuses existing REQUESTED/ISSUED rows); records IntegrationRun + OrderEvent on every path
- [x] **2.5** MP webhook auto-calls `issueInvoice` after `publishOrderToErp`, gated by `SettingsKv.invoice.autoIssueOnPaid` (default `true`)
- [x] **2.6** [scripts/poll-invoices.ts](../../scripts/poll-invoices.ts) picks up REQUESTED rows older than 60s and reconciles (up to 20 per run)
- [x] **2.7** `brilhodediva-invoice-poll` cron `*/5 * * * *` in [ecosystem.config.js](../../ecosystem.config.js); `./scripts/bdd bootstrap` picks it up automatically
- [x] **2.8** Template `invoice_issued` (pt-BR, transactional) with DANFE link + optional XML link; fires when poll promotes REQUESTED→ISSUED

### Settings
- [x] **2.9** `invoice.autoIssueOnPaid` in [lib/settings.ts](../../lib/settings.ts); surfaced at `/admin/configuracoes`

### Admin UI
- [x] **2.10** [InvoiceCard](../../components/admin/InvoiceCard.tsx) on `/admin/pedidos/[orderId]` — status pill, number/serie/access key, DANFE/XML download buttons, "Re-emitir" (when FAILED/CANCELLED), "Atualizar status" (when REQUESTED), "Cancelar NF-e" with motivo textarea
- [x] **2.11** Admin list: NF column renders issued number or status pill
- [x] **2.12** [lib/admin-actions.ts](../../lib/admin-actions.ts): `issueInvoiceAction` / `reconcileInvoiceAction` / `cancelInvoiceAction` with admin gate + path revalidation

### Customer UI
- [x] **2.13** Customer order detail: "Baixar nota fiscal (PDF)" + "Baixar XML" buttons visible when Invoice.status = ISSUED

### CLI
- [x] **2.14** `bdd invoice <orderNumber>` — runs [scripts/issue-invoice-cli.ts](../../scripts/issue-invoice-cli.ts)
- [x] **2.15** `bdd invoice-status <orderNumber>` — last 5 Invoice rows for an order
- [x] **2.16** `bdd invoice-poll` — runs the sweeper once

### Ship
- [x] **2.17** Typecheck clean (first pass); deploy green; DivaHub 307 pre + post; `bdd bootstrap` registered the new cron; `bdd invoice-poll` smoke run returned `processed=0 promoted=0 failed=0` (no pending invoices yet — expected)

---

## Notes / decisions

- **Auto-issue on payment approval** ships default-on per user direction (2026-04-18). Toggle at `/admin/configuracoes` if Tiny emission needs to be batched manually.
- **Poll over inline wait**: after emission we return immediately. `brilhodediva-invoice-poll` (every 5 min) pulls SEFAZ status updates. Worst-case lag before the customer sees their NF email is ~10 min. Acceptable.
- **Tiny response shape is config-dependent** — the adapter handles `chave_acesso` and `chaveAcesso`, `link_nfe` / `link_danfe` / `linkNfe` / `link`, and a `registros.registro` vs `registros.nota_fiscal` wrapper. Anything unexpected still lands in `Invoice.rawPayload` for inspection.
- **Idempotency** via `@@unique([provider, providerInvoiceId])` + an early return in `issueInvoice` when a non-FAILED Invoice already exists. Safe against webhook retries and double-clicks on the admin button.
- **Emission failure is non-fatal to the MP webhook** — wrapped in try/catch; we don't want Tiny outages to break payment processing. Failures still appear as `Invoice(status=FAILED)` + `OrderEvent(INVOICE_FAILED)` + `IntegrationRun(status=error)` so admins can retry.
- **`mapTinySituacao`** normalizes pt-BR labels ("autorizada", "emitida", "cancelada", "denegada", "rejeitada") to 4 internal states. Unknown values default to `pending` (safe — keeps polling rather than marking FAILED).
- **Customer NF download** only shows when `Invoice.status = ISSUED`. No half-state messaging on the customer side — they don't need to see SEFAZ quirks.

---

## What's next

Phase 3 — Refunds (Mercado Pago). Key decisions already pinned:
- Admin modal with amount (default full) + reason textarea + "irreversible" confirmation
- Partial refunds supported; `Payment.refundedCents` aggregates
- `refund_issued` pt-BR email, transactional, no opt-in gate
- Existing webhook path (detecting externally-initiated refunds via MP dashboard) stays authoritative alongside the new admin action

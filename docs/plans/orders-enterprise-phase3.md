# Orders enterprise overhaul — Phase 3 progress

**Strategic plan:** [orders-enterprise.md](orders-enterprise.md) · **Previous phase:** [phase 2](orders-enterprise-phase2.md)

**Status:** ✅ **SHIPPED** 2026-04-18 · deployed + DivaHub safe.

**Phase goal:** Admins can refund a payment (full or partial) directly from the order detail page. The action calls MP, updates our Payment row, emits an OrderEvent, and sends the customer a `refund_issued` email. Externally-initiated refunds (MP dashboard, chargebacks) follow the same path via the webhook so behavior stays consistent.

---

## Checklist

### MP integration
- [x] **3.1** `refundMpPayment` in [lib/integration/mp/client.ts](../../lib/integration/mp/client.ts) — `POST /v1/payments/{id}/refunds`; omit amount for full refund

### Orchestration
- [x] **3.2** [lib/refunds.ts](../../lib/refunds.ts) — `refundPayment({ orderId, paymentId?, amountCents?, reason, actor })`:
  - resolves the refund-target Payment (explicit id or latest APPROVED)
  - guards against >remaining amounts / short reasons / missing providerId
  - calls MP, then re-fetches the Payment to get MP's authoritative `refunded_amount` (cumulative) + `status`
  - writes Payment (refundedCents, refundedAt, status) + Order.status when fully refunded
  - emits `PAYMENT_REFUNDED` OrderEvent with amount + reason + refundId + totalRefundedCents
  - writes IntegrationRun (adapter=mercadopago, operation=refund)
  - enqueues `refund_issued` email

### Notification
- [x] **3.3** Template `refund_issued` (pt-BR, transactional) — this-refund + total-refunded + reason + settlement window messaging

### Webhook unification
- [x] **3.4** MP webhook REFUNDED branch now fires `refund_issued` too, so externally-initiated refunds notify the customer. Dedup via Notification `@@unique([orderId, template, channel])`.

### Admin UI
- [x] **3.5** [RefundButton](../../components/admin/RefundButton.tsx) component — inline expansion into amount field + reason textarea + "irreversível" ack checkbox; validates locally before calling the server action
- [x] **3.6** Admin detail Payment card renders the button per Payment row when refundable (APPROVED or partial-refund with remaining > 0 and providerId present)
- [x] **3.7** `refundPaymentAction` in [lib/admin-actions.ts](../../lib/admin-actions.ts) delegates to the orchestrator with `actor=admin:<id>` + path revalidation

### CLI
- [x] **3.8** [scripts/refund-cli.ts](../../scripts/refund-cli.ts) + `./scripts/bdd refund <orderNumber> --reason="..." [--amount=R$X]`

### Ship
- [x] **3.9** Typecheck clean first pass; deploy green; DivaHub 307 pre + post

---

## Notes / decisions

- **MP refund endpoint is idempotent at the refund-id level, not the amount level** — repeating the same POST creates a second refund. The RefundButton handles double-submit via the loading state + the `ack` checkbox reset. For CLI safety, script stops after a single successful call.
- **Source of truth for refundedCents**: we trust MP's cumulative `refunded_amount` over local arithmetic. After each refund we re-fetch the Payment from MP and write what it says. This keeps us consistent with externally-initiated refunds (dashboard or chargeback) without needing to reconcile later.
- **Order.status flip only on full refund** — partial refunds leave the fulfillment state alone (PAID/PACKED/SHIPPED/DELIVERED). Refunds don't un-ship things.
- **Reason min length is 10 client-side** — MP doesn't enforce, but the audit trail benefits from a non-empty justification.
- **One email per order, not per refund** — Notification unique constraint means if an order has multiple partial refunds, only the first fires a customer email. Acceptable for boutique volume; Phase-4 logistics or Phase-5 operational-ops layer could revisit.
- **Partial vs full selection is implicit in the payload** — the RefundButton passes `amountCents: undefined` when the user types exactly the remaining amount on a pristine payment (== MP's default full-refund semantics). Otherwise passes an explicit amount for a partial.

---

## What's next

Phase 4 — Logistics (Melhor Envio labels + carrier webhooks). Decisions already pinned:
- "Comprar etiqueta" button stays manual (not auto on PAID)
- Melhor Envio webhook endpoint with HMAC signature
- New Shipment model replacing ad-hoc tracking fields as source of truth
- `out_for_delivery` + `delivery_exception` pt-BR templates
- Auto-transition Order.status to DELIVERED on carrier "entregue" webhook

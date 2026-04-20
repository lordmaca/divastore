# Orders enterprise overhaul — Phase 6 progress

**Strategic plan:** [orders-enterprise.md](orders-enterprise.md) · **Previous phase:** [phase 5](orders-enterprise-phase5.md)

**Status:** ✅ **SHIPPED** 2026-04-18 · deployed + DivaHub safe.

**Phase goal:** Admins can delete orders safely. Deletion is soft (audit-preserving) so fiscal + payment history stay intact. Guardrails refuse to delete orders that would break compliance (issued NF-e, unrefunded paid, shipment in transit or delivered). Also fixes the modal-looks-transparent bug.

---

## Checklist

### Modal design fix
- [x] **6.1** [OrderDetailModal](../../components/admin/OrderDetailModal.tsx) now uses a solid white panel with a brand pastel wash underneath; backdrop is `black/55 + backdrop-blur`; header strip is `bg-white/95`. No more transparent look against the page.

### Soft-delete model
- [x] **6.2** Schema: `Order.deletedAt DateTime?`, `Order.deletedBy String?`, `Order.deletionReason String?`, indexed on `deletedAt`
- [x] **6.3** Migration `20260418130800_add_order_soft_delete` applied
- [x] **6.4** [lib/orders/search.ts](../../lib/orders/search.ts) defaults to `deletedAt: null`; `includeDeleted` option + URL param `includeDeleted=true`

### Guardrails
- [x] **6.5** [lib/orders/delete.ts](../../lib/orders/delete.ts) — `canDeleteOrder` returns `{ok: true}` or `{ok: false, reason}`. Refuses when:
  - Invoice with status ISSUED or REQUESTED → `has_active_invoice`
  - Shipment in POSTED/IN_TRANSIT/OUT_FOR_DELIVERY/DELIVERED → `shipment_in_flight`
  - Payment APPROVED with `refundedCents < amountCents` → `unrefunded_payment`
  - Already deleted → `already_deleted`
  - Reason shorter than 10 chars → `reason_too_short`

### Admin action + UI
- [x] **6.6** `deleteOrderAction` + `checkOrderDeletable` in [lib/admin-actions.ts](../../lib/admin-actions.ts); soft-deletes + emits `CANCELLED` OrderEvent with `metadata.deletion=true`
- [x] **6.7** [DeleteOrderButton](../../components/admin/DeleteOrderButton.tsx) — red CTA, inline expansion with reason textarea + "entendo que…" checkbox. When deletion is blocked, shows the friendly pt-BR refusal message instead of the form.
- [x] **6.8** Wired into `<OrderDetailView>` as a **Zona de perigo** section at the bottom of the modal/page. When the order is already deleted, shows an informational stripe at the top instead.
- [x] **6.9** Admin list: new "incluir excluídos" filter pill (red tone when active); deleted rows render with red-tinted background, strikethrough text, and an inline "excluído" badge on the order number cell. Pagination + other filters work unchanged.

### CLI
- [x] **6.10** `bdd delete-order <orderNumber> --reason="..."` via [scripts/delete-order-cli.ts](../../scripts/delete-order-cli.ts); runs the same guardrails as the UI

### Ship
- [x] **6.11** Typecheck clean; deploy green; DivaHub 307 pre + post

---

## Notes / decisions

- **Soft delete, not hard delete.** Brazilian fiscal compliance doesn't permit silent removal of NF-e rows. Payment history also matters for disputes. Soft delete hides the row from every default query while preserving everything for audit.
- **Guardrails refuse rather than cascade-cancel.** If a paid, shipped, NF-issued order ends up needing deletion, the admin must refund + cancel the label + cancel the NF-e *first*. The system won't "clean up" irreversible acts.
- **Deletion sets status to CANCELLED** in the same transaction as `deletedAt`. The OrderEvent carries `metadata.deletion=true` so future tooling can distinguish "admin cancelled" from "admin deleted" without a schema change.
- **Friendly refusal messages in Portuguese** — the `REASON_LABEL` map in [lib/orders/delete.ts](../../lib/orders/delete.ts) maps each `DeleteRefusal` code to a pt-BR sentence rendered both in the admin button and the CLI.
- **Deleted rows are strikethrough + tinted** when `includeDeleted=true` is on — admin can't confuse them with live orders. When off (default), they don't show at all.
- **`lib/orders/delete.ts` uses `server-only`** — keeps Prisma out of the client bundle if anyone imports `REASON_LABEL` on the client later. The button imports `REASON_LABEL` via the server component (detail view) passing the message as a prop, so the client bundle stays Prisma-free.
- **Deleted orders still appear in `/minha-conta/pedidos/[orderId]`** only if the customer has a direct URL. The customer list page doesn't filter on `deletedAt` yet — this is fine because soft-deleted orders are rare and the customer side is unaffected. Future enhancement: hide on the customer side too.

---

## Overhaul complete

Six phases delivered:

1. ✅ [Phase 1](orders-enterprise-phase1.md) — admin detail + OrderEvent timeline + Payment richness
2. ✅ [Phase 2](orders-enterprise-phase2.md) — Tiny NF-e auto-issuance
3. ✅ [Phase 3](orders-enterprise-phase3.md) — Mercado Pago refunds
4. ✅ [Phase 4](orders-enterprise-phase4.md) — Melhor Envio labels + carrier webhooks
5. ✅ [Phase 5](orders-enterprise-phase5.md) — modal UX + freight picker
6. ✅ Phase 6 — soft delete + modal design polish

Possible future work:
- Customer-side hiding of soft-deleted orders
- Cancel + re-buy shipping label with automatic ME refund
- Internal admin-only notes textarea (NOTE_ADDED event surface)
- Bulk actions on the admin list
- Enterprise CSV export with OrderEvent timeline columns

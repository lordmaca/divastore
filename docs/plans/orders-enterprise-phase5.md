# Orders enterprise overhaul — Phase 5 progress

**Strategic plan:** [orders-enterprise.md](orders-enterprise.md) · **Previous phase:** [phase 4](orders-enterprise-phase4.md)

**Status:** ✅ **SHIPPED** 2026-04-18 · deployed + DivaHub safe.

**Phase goal:** Admins manage an order in a **modal** opened from the list — no page navigation, no context loss. Inside the modal the full order detail is rendered (pagamento, fiscal, logística, timeline, ações). The shipping label card gains a freight picker so admins can (re-)choose a Melhor Envio service on orders that have no `shippingServiceId` or when they want to override the customer's pick.

---

## Checklist

### Modal UX (intercepting routes)
- [x] **5.1** [components/admin/OrderDetailView.tsx](../../components/admin/OrderDetailView.tsx) — async server component that fetches the order + renders every card. Shared between the full-page route and the modal.
- [x] **5.2** [app/admin/pedidos/[orderId]/page.tsx](../../app/admin/pedidos/%5BorderId%5D/page.tsx) delegates body to the component. Direct URLs still work (deep links, refresh, share).
- [x] **5.3** Parallel-route setup:
  - [app/admin/pedidos/layout.tsx](../../app/admin/pedidos/layout.tsx) composes `{children}` + `{modal}`
  - [app/admin/pedidos/@modal/default.tsx](../../app/admin/pedidos/@modal/default.tsx) empty slot (required)
  - [app/admin/pedidos/@modal/(.)[orderId]/page.tsx](../../app/admin/pedidos/@modal/%28.%29%5BorderId%5D/page.tsx) intercepts navigation from the list, renders the same `<OrderDetailView>` inside `<OrderDetailModal>`
- [x] **5.4** [components/admin/OrderDetailModal.tsx](../../components/admin/OrderDetailModal.tsx) — overlay on ≥sm, bottom-sheet on < sm; Esc closes; backdrop-click closes; body scroll locked while open; sticky close button
- [x] **5.5** [components/admin/OrderRow.tsx](../../components/admin/OrderRow.tsx) — entire row is a clickable/focusable `<tr role="button">`; action buttons use `stopPropagation` so clicks there don't also open the modal

### Flexible shipping service picker
- [x] **5.6** [components/admin/ShipServicePicker.tsx](../../components/admin/ShipServicePicker.tsx) — "Escolher/Trocar serviço de frete" expands into a live ME quote list; admin picks → server action persists
- [x] **5.7** `quoteOrderShipping` + `setOrderShippingChoice` admin actions in [lib/admin-actions.ts](../../lib/admin-actions.ts); the latter recomputes `Order.totalCents` and emits `NOTE_ADDED` OrderEvent capturing the old/new carrier + price
- [x] **5.8** `ShippingLabelCard` mounts the picker whenever `!shipment && orderIsShippable`. Hidden once a Shipment exists (switching carrier after debiting ME balance is a separate flow).

### Ship
- [x] **5.9** Typecheck clean; deploy green; DivaHub 307 pre + post; unauthed admin routes redirect 307 to login (expected)

---

## Notes / decisions

- **`lib/orders.ts` split**: turbopack bundled the file into the client chunk because the client `OrderRow` imported a constant from it — and `lib/orders.ts` also imported Prisma for `recordOrderEvent`, which made the build fail with "node:module not supported by chunking context." Fix: moved `recordOrderEvent` to [lib/order-events.ts](../../lib/order-events.ts) guarded by `import "server-only"`. Pure constants (`FULFILLED_ORDER_STATE_SET`, `ORDER_EVENT_LABEL`) stayed in `lib/orders.ts` — safe for both runtimes. Every server-side caller (admin-actions, shipments, refunds, invoices, checkout action, MP webhook) re-imported from the new path. `server-only` added to dependencies.
- **Intercepting route pattern chosen over pure-client modal**: real URL (`/admin/pedidos/<id>`), browser back works, deep links still resolve to the standalone page. The cost is Next parallel-route ceremony (`@modal`, `default.tsx`, interceptor `(.)` prefix) which is now documented in the layout file.
- **Modal re-uses the full-page server component** — no risk of drift between the two surfaces. Both show the same 7 cards.
- **List rows are `<tr role="button">` with onClick + keyboard handlers** — accessible; Enter/Space also trigger navigation. Action cell blocks event bubbling so inline buttons work without opening the modal.
- **Service picker writes a `NOTE_ADDED` event** with from/to carrier + price in metadata. The timeline captures overrides without needing a new event type. The message is pt-BR so it reads naturally in the admin timeline strip.
- **Total recalculation on service change** — `totalCents = subtotal + newShipping - discount`. Matches the invariant the checkout action guarantees. If a partial refund has been processed, the total may now diverge from the refunded amount — acceptable, since the admin is operationally choosing a new service and accepting the cost change.
- **Picker is hidden after the label is purchased** — switching carriers after debiting the ME balance would require refunding the first label (ME `/me/shipment/cancel` endpoint, future work). v1: admin needs to cancel + re-buy manually in the Melhor Envio panel.

---

## What's next

The orders enterprise overhaul is now 5 phases deep:

1. ✅ Foundation: [phase 1](orders-enterprise-phase1.md)
2. ✅ NF-e invoices: [phase 2](orders-enterprise-phase2.md)
3. ✅ Refunds: [phase 3](orders-enterprise-phase3.md)
4. ✅ Logistics labels + webhooks: [phase 4](orders-enterprise-phase4.md)
5. ✅ Modal UX + freight picker: this file

Possible follow-ups (not in scope):
- Cancel + re-buy shipping label with automatic ME refund
- `NOTE_ADDED` internal-admin-only notes textarea on the detail page
- Bulk actions on the admin list (multi-select → "buy labels for all visible", "mark shipped", etc.)
- `/api/admin/exports/orders-enterprise.csv` — single CSV with payment + invoice + shipment + timeline columns

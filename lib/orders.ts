import { OrderStatus, OrderEventType } from "@/lib/generated/prisma/enums";

// Pure, client-safe helpers. Do NOT import Prisma or the DB here — the
// admin list row is a client component that pulls `FULFILLED_ORDER_STATE_SET`
// and must not drag Node-only modules into the browser bundle.
//
// Server-side helpers (recordOrderEvent) live in lib/order-events.ts.

// Statuses where the customer has paid and the order is in (or past) fulfillment.
// Used to gate review eligibility, "publish to ERP" buttons, etc.
export const FULFILLED_ORDER_STATES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export const FULFILLED_ORDER_STATE_SET = new Set<OrderStatus>(FULFILLED_ORDER_STATES);

// Human-readable pt-BR label for timeline rendering. Admin + customer UIs
// share this so the wording stays consistent.
export const ORDER_EVENT_LABEL: Record<OrderEventType, string> = {
  ORDER_CREATED: "Pedido criado",
  PAYMENT_PENDING: "Pagamento pendente",
  PAYMENT_APPROVED: "Pagamento aprovado",
  PAYMENT_REJECTED: "Pagamento recusado",
  PAYMENT_REFUNDED: "Pagamento reembolsado",
  PAYMENT_CHARGED_BACK: "Chargeback recebido",
  INVOICE_REQUESTED: "NF-e solicitada",
  INVOICE_ISSUED: "NF-e emitida",
  INVOICE_FAILED: "Falha ao emitir NF-e",
  INVOICE_CANCELLED: "NF-e cancelada",
  LABEL_PURCHASED: "Etiqueta de envio comprada",
  SHIPPED: "Pedido enviado",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERY_EXCEPTION: "Problema na entrega",
  DELIVERED: "Pedido entregue",
  CANCELLED: "Pedido cancelado",
  NOTE_ADDED: "Observação interna",
};

// Re-exported from lib/order-events.ts so existing imports keep working.
// This line is a type-only re-export; the implementation stays server-only.
export type { RecordOrderEventInput } from "@/lib/order-events";

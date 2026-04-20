"use client";

import { useRouter } from "next/navigation";
import type { SyntheticEvent } from "react";
import { formatBRL } from "@/lib/money";
import { RetryPublishButton } from "@/components/admin/RetryPublishButton";
import { OrderShipControls } from "@/components/admin/OrderShipControls";
import { FULFILLED_ORDER_STATE_SET } from "@/lib/orders";

// Fully-clickable admin order row. Navigates to /admin/pedidos/[orderId]
// which opens the intercepting-route modal in-place. Action buttons use
// stopPropagation so clicks on them don't also fire the row navigation.

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700",
  AWAITING_PAYMENT: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  PACKED: "bg-emerald-100 text-emerald-800",
  SHIPPED: "bg-sky-100 text-sky-800",
  DELIVERED: "bg-sky-100 text-sky-800",
  CANCELLED: "bg-red-100 text-red-700",
  REFUNDED: "bg-red-100 text-red-700",
};

const NF_TONE: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  ISSUED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-100 text-zinc-700",
  FAILED: "bg-red-100 text-red-700",
};

export type OrderRowProps = {
  order: {
    id: string;
    number: number;
    createdAt: Date | string;
    customer: { name: string | null; email: string } | null;
    items: Array<{ id: string }>;
    totalCents: number;
    lastPaymentMethod: string | null;
    lastPaymentStatus: string | null;
    status: string;
    tinyOrderId: string | null;
    trackingCode: string | null;
    shippingCarrier: string | null;
    deletedAt: Date | string | null;
  };
  invoice: {
    status: string;
    number: string | null;
    serie: string | null;
  } | null;
};

function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function OrderRow({ order, invoice }: OrderRowProps) {
  const router = useRouter();
  const href = `/admin/pedidos/${order.id}`;
  const isDeleted = Boolean(order.deletedAt);

  return (
    <tr
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Abrir pedido #${order.number}`}
      className={`border-t border-white/50 cursor-pointer focus:outline-none ${
        isDeleted
          ? "bg-red-50/40 hover:bg-red-50/70 focus:bg-red-50 text-[color:var(--foreground)]/65 line-through decoration-red-400/60"
          : "hover:bg-white/60 focus:bg-white/70"
      }`}
    >
      <td className="px-3 py-3 font-mono">
        <span className="text-[color:var(--pink-600)] underline-offset-2 group-hover:underline">
          #{order.number}
        </span>
        {isDeleted ? (
          <span className="ml-1 inline-block text-[9px] uppercase tracking-wide bg-red-600 text-white px-1.5 py-0.5 rounded-full no-underline">
            excluído
          </span>
        ) : null}
        <div className="text-[10px] text-[color:var(--foreground)]/55 no-underline">
          {new Date(order.createdAt).toLocaleDateString("pt-BR")}
        </div>
      </td>
      <td className="px-3 py-3">
        <div>{order.customer?.name ?? "—"}</div>
        <div className="text-xs text-[color:var(--foreground)]/65">
          {order.customer?.email ?? "anônimo"}
        </div>
      </td>
      <td className="px-3 py-3">{order.items.length}</td>
      <td className="px-3 py-3 font-semibold text-[color:var(--pink-600)]">
        {formatBRL(order.totalCents)}
      </td>
      <td className="px-3 py-3 text-xs">
        {order.lastPaymentMethod ? (
          <>
            <span className="font-medium">{order.lastPaymentMethod}</span>
            {order.lastPaymentStatus ? (
              <span className="block text-[10px] text-[color:var(--foreground)]/55">
                {order.lastPaymentStatus}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-[color:var(--foreground)]/45">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs ${STATUS_TONE[order.status] ?? ""}`}
        >
          {order.status}
        </span>
      </td>
      <td className="px-3 py-3 font-mono text-xs">
        {order.tinyOrderId ?? <span className="text-[color:var(--foreground)]/45">—</span>}
      </td>
      <td className="px-3 py-3 text-xs">
        {invoice ? (
          invoice.status === "ISSUED" && invoice.number ? (
            <span className="font-mono">
              {invoice.number}
              {invoice.serie ? `/${invoice.serie}` : ""}
            </span>
          ) : (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] ${NF_TONE[invoice.status] ?? ""}`}
            >
              {invoice.status}
            </span>
          )
        ) : (
          <span className="text-[color:var(--foreground)]/45">—</span>
        )}
      </td>
      <td className="px-3 py-3 font-mono text-xs">
        {order.trackingCode ?? <span className="text-[color:var(--foreground)]/45">—</span>}
      </td>
      <td className="px-3 py-3" onClick={stop} onKeyDown={stop}>
        <div className="flex flex-col items-start gap-1">
          <RetryPublishButton
            orderId={order.id}
            alreadyPublished={Boolean(order.tinyOrderId)}
            paid={FULFILLED_ORDER_STATE_SET.has(
              order.status as Parameters<typeof FULFILLED_ORDER_STATE_SET.has>[0],
            )}
          />
          <OrderShipControls
            orderId={order.id}
            status={order.status}
            trackingCode={order.trackingCode}
            shippingCarrier={order.shippingCarrier}
          />
        </div>
      </td>
    </tr>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markOrderShipped, markOrderDelivered, markOrderPaid } from "@/lib/admin-actions";

type Props = {
  orderId: string;
  status: string;
  trackingCode?: string | null;
  shippingCarrier?: string | null;
};

// Inline controls that replace the plain text status with ship/deliver
// transition buttons when the order is ready.
export function OrderShipControls({ orderId, status, trackingCode, shippingCarrier }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(trackingCode ?? "");
  const [url, setUrl] = useState("");
  const [carrier, setCarrier] = useState(shippingCarrier ?? "");
  const [eta, setEta] = useState<string>("");

  if (status === "PENDING" || status === "AWAITING_PAYMENT") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (
              !confirm(
                "Confirmar que este pedido foi pago? A ação gera um evento, publica no Tiny e notifica o cliente.",
              )
            ) {
              return;
            }
            try {
              await markOrderPaid(orderId);
              router.refresh();
            } catch (e) {
              alert(e instanceof Error ? e.message : "Erro");
            }
          })
        }
        className="rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1"
      >
        {pending ? "..." : "Marcar como pago"}
      </button>
    );
  }

  if (status === "PAID" || status === "PACKED") {
    return (
      <div className="flex flex-col items-start gap-1">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium px-3 py-1"
          >
            Marcar como enviado
          </button>
        ) : (
          <div className="space-y-2 bg-white/80 rounded-xl p-2 w-64">
            <input
              placeholder="Código de rastreio"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full text-xs rounded px-2 py-1 border border-pink-200"
            />
            <input
              placeholder="URL de rastreio (opcional)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full text-xs rounded px-2 py-1 border border-pink-200"
            />
            <input
              placeholder="Transportadora (ex: Correios)"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full text-xs rounded px-2 py-1 border border-pink-200"
            />
            <input
              placeholder="Prazo (dias úteis)"
              type="number"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              className="w-full text-xs rounded px-2 py-1 border border-pink-200"
            />
            <div className="flex gap-1">
              <button
                type="button"
                disabled={pending || !code.trim()}
                onClick={() =>
                  start(async () => {
                    try {
                      await markOrderShipped(orderId, {
                        trackingCode: code,
                        trackingUrl: url || undefined,
                        carrier: carrier || undefined,
                        etaDays: eta ? Number(eta) : undefined,
                      });
                      setOpen(false);
                      router.refresh();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Erro");
                    }
                  })
                }
                className="rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1"
              >
                {pending ? "..." : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-[color:var(--foreground)]/65"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === "SHIPPED") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await markOrderDelivered(orderId);
              router.refresh();
            } catch (e) {
              alert(e instanceof Error ? e.message : "Erro");
            }
          })
        }
        className="rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1"
      >
        {pending ? "..." : "Marcar como entregue"}
      </button>
    );
  }

  return null;
}

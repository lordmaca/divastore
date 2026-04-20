"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { purchaseShippingLabelAction } from "@/lib/admin-actions";
import { formatBRL } from "@/lib/money";
import { ShipServicePicker } from "@/components/admin/ShipServicePicker";

type ShipmentRow = {
  id: string;
  providerShipmentId: string | null;
  status: string;
  carrier: string;
  serviceId: string;
  priceCents: number;
  trackingCode: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  purchasedAt: Date | string | null;
  deliveredAt: Date | string | null;
  lastError: string | null;
};

type Props = {
  orderId: string;
  orderIsShippable: boolean;
  shippingCents: number;
  shippingCarrier: string | null;
  shippingServiceId: string | null;
  shippingEtaDays: number | null;
  // The following are accepted for future use by child components (picker,
  // future reprint flows). Not required for the card itself.
  destinationCep?: string;
  items?: Array<{ variantId: string; qty: number }>;
  shipment: ShipmentRow | null;
};

const STATUS_TONE: Record<string, string> = {
  QUOTED: "bg-zinc-100 text-zinc-700",
  PURCHASED: "bg-emerald-100 text-emerald-800",
  PRINTED: "bg-emerald-100 text-emerald-800",
  POSTED: "bg-sky-100 text-sky-800",
  IN_TRANSIT: "bg-sky-100 text-sky-800",
  OUT_FOR_DELIVERY: "bg-sky-100 text-sky-800",
  DELIVERED: "bg-sky-100 text-sky-800",
  EXCEPTION: "bg-amber-100 text-amber-800",
  RETURNED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  QUOTED: "Cotado",
  PURCHASED: "Etiqueta comprada",
  PRINTED: "Etiqueta impressa",
  POSTED: "Postado",
  IN_TRANSIT: "Em trânsito",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERED: "Entregue",
  EXCEPTION: "Ocorrência",
  RETURNED: "Devolvido",
  CANCELLED: "Cancelado",
};

function friendlyReason(reason: string): string {
  const map: Record<string, string> = {
    order_not_found: "Pedido não encontrado.",
    order_not_shippable: "Pedido ainda não está pronto para envio (precisa estar PAGO ou EM SEPARAÇÃO).",
    no_shipping_service_selected: "Nenhum serviço de frete selecionado.",
    origin_address_missing:
      "Endereço de origem não configurado em Configurações → Logística.",
    customer_cpf_missing:
      "Cliente sem CPF cadastrado. Peça para o cliente completar o cadastro em Minha conta → Meu perfil antes de tentar novamente.",
  };
  if (map[reason]) return map[reason];
  // me_cart_error: <detail from ME>
  if (reason.startsWith("me_cart_error:")) {
    return `Melhor Envio rejeitou: ${reason.slice("me_cart_error:".length).trim()}`;
  }
  if (reason === "me_checkout_error") return "Falha ao pagar pelo saldo do Melhor Envio.";
  if (reason === "me_generate_error") return "Falha ao gerar a etiqueta no Melhor Envio.";
  return reason;
}

export function ShippingLabelCard(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  function buy() {
    start(async () => {
      setMsg(null);
      setOk(null);
      const res = await purchaseShippingLabelAction(p.orderId);
      setOk(res.ok);
      setMsg(
        res.ok
          ? res.reused
            ? "Etiqueta já existia — carregada."
            : `Etiqueta comprada${res.trackingCode ? " · rastreio " + res.trackingCode : ""}.`
          : `Falha: ${friendlyReason(res.reason)}`,
      );
      router.refresh();
    });
  }

  return (
    <section className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--foreground)]/65">
          Logística
        </h2>
        {p.shipment ? (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[p.shipment.status] ?? ""}`}>
            {STATUS_LABEL[p.shipment.status] ?? p.shipment.status}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--foreground)]/55">sem etiqueta</span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-[color:var(--foreground)]/55">Transportadora</p>
          <p>{p.shipment?.carrier ?? p.shippingCarrier ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-[color:var(--foreground)]/55">Serviço</p>
          <p>{p.shipment?.serviceId ?? p.shippingServiceId ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-[color:var(--foreground)]/55">Custo</p>
          <p>{formatBRL(p.shipment?.priceCents ?? p.shippingCents)}</p>
        </div>
        <div>
          <p className="text-xs text-[color:var(--foreground)]/55">Prazo cotado</p>
          <p>{p.shippingEtaDays != null ? `${p.shippingEtaDays} dias úteis` : "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-[color:var(--foreground)]/55">Rastreio</p>
          {p.shipment?.trackingCode ? (
            <p className="font-mono">
              {p.shipment.trackingCode}
              {p.shipment.trackingUrl ? (
                <a
                  href={p.shipment.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-[color:var(--pink-600)] hover:underline text-xs"
                >
                  abrir rastreamento →
                </a>
              ) : null}
            </p>
          ) : (
            <p>—</p>
          )}
        </div>
        {p.shipment?.purchasedAt ? (
          <div>
            <p className="text-xs text-[color:var(--foreground)]/55">Comprada em</p>
            <p>{new Date(p.shipment.purchasedAt).toLocaleString("pt-BR")}</p>
          </div>
        ) : null}
        {p.shipment?.deliveredAt ? (
          <div>
            <p className="text-xs text-[color:var(--foreground)]/55">Entregue em</p>
            <p>{new Date(p.shipment.deliveredAt).toLocaleString("pt-BR")}</p>
          </div>
        ) : null}
        {p.shipment?.lastError ? (
          <div className="sm:col-span-2">
            <p className="text-xs text-[color:var(--foreground)]/55">Última ocorrência</p>
            <p className="text-amber-700 text-xs">{p.shipment.lastError}</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/60">
        {p.shipment?.labelUrl ? (
          <a
            href={p.shipment.labelUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-xs font-medium px-3 py-1.5"
          >
            Baixar etiqueta (PDF)
          </a>
        ) : null}
        {!p.shipment && p.orderIsShippable && p.shippingServiceId ? (
          <button
            type="button"
            disabled={pending}
            onClick={buy}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
          >
            {pending ? "…" : "Comprar etiqueta"}
          </button>
        ) : null}
        {/* Let the admin pick / override the service when no label exists yet.
            Hidden once a Shipment is purchased — switching carrier after
            debiting ME balance is a separate (not-yet-supported) flow. */}
        {!p.shipment && p.orderIsShippable ? (
          <ShipServicePicker
            orderId={p.orderId}
            currentServiceId={p.shippingServiceId}
            currentCarrier={p.shippingCarrier}
            currentPriceCents={p.shippingCents}
          />
        ) : null}
        {!p.orderIsShippable && !p.shipment ? (
          <span className="text-xs text-[color:var(--foreground)]/55">
            Pedido precisa estar PAID ou PACKED para comprar etiqueta.
          </span>
        ) : null}
      </div>

      {msg ? (
        <p className={`text-xs ${ok ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>
      ) : null}
    </section>
  );
}

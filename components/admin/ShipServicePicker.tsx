"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quoteOrderShipping, setOrderShippingChoice } from "@/lib/admin-actions";
import { formatBRL } from "@/lib/money";

type Option = {
  serviceId: string;
  carrier: string;
  name: string;
  priceCents: number;
  etaDays: number;
};

type Props = {
  orderId: string;
  currentServiceId: string | null;
  currentCarrier: string | null;
  currentPriceCents: number;
};

// Lets the admin (re-)pick a Melhor Envio service for an order without
// leaving the modal. Useful when the order has no `shippingServiceId` yet
// or when the admin needs to override the customer's checkout pick before
// buying the label.
export function ShipServicePicker(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  function quote() {
    start(async () => {
      setError(null);
      setOptions(null);
      setSelected(null);
      const res = await quoteOrderShipping(p.orderId);
      if (res.ok) {
        setOptions(res.options);
        if (res.options.length === 0) {
          setError("Nenhuma opção de frete encontrada para este endereço");
        }
      } else {
        setError(res.reason);
      }
    });
  }

  function save() {
    const opt = options?.find((o) => o.serviceId === selected);
    if (!opt) return;
    start(async () => {
      setError(null);
      try {
        await setOrderShippingChoice({
          orderId: p.orderId,
          serviceId: opt.serviceId,
          carrier: opt.carrier,
          priceCents: opt.priceCents,
          etaDays: opt.etaDays,
        });
        setOpen(false);
        setOptions(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          quote();
        }}
        className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1.5"
      >
        {p.currentServiceId ? "Trocar serviço de frete" : "Escolher serviço de frete"}
      </button>
    );
  }

  return (
    <div className="border border-white/60 rounded-xl p-3 bg-white/50 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Escolha um serviço de frete</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={quote}
            disabled={pending}
            className="text-xs text-[color:var(--pink-600)] hover:underline disabled:opacity-50"
          >
            {pending ? "cotando…" : "recotar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setOptions(null);
              setError(null);
              setSelected(null);
            }}
            className="text-xs text-[color:var(--foreground)]/65"
          >
            fechar
          </button>
        </div>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {options === null && pending ? (
        <p className="text-xs text-[color:var(--foreground)]/60">Cotando frete…</p>
      ) : null}

      {options && options.length > 0 ? (
        <>
          <ul className="space-y-1">
            {options.map((o) => {
              const active = selected === o.serviceId;
              const isCurrent = o.serviceId === p.currentServiceId;
              return (
                <li key={o.serviceId}>
                  <button
                    type="button"
                    onClick={() => setSelected(o.serviceId)}
                    className={`w-full text-left rounded-lg border px-3 py-2 flex items-center justify-between text-xs transition-colors ${
                      active
                        ? "border-[color:var(--pink-500)] bg-pink-50"
                        : "border-white/70 bg-white/70 hover:bg-white"
                    }`}
                  >
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {o.carrier} · {o.name}
                        {isCurrent ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">
                            atual
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[color:var(--foreground)]/60">
                        {o.etaDays} dias úteis
                      </div>
                    </div>
                    <div className="font-semibold text-[color:var(--pink-600)]">
                      {formatBRL(o.priceCents)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected ? (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/60">
              <p className="text-[11px] text-[color:var(--foreground)]/70">
                O total do pedido é recalculado ao salvar.
              </p>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
              >
                {pending ? "…" : "Salvar escolha"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

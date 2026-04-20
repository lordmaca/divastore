"use client";

import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/money";

type Option = {
  serviceId: string;
  carrier: string;
  name: string;
  priceCents: number;
  etaDays: number;
  etaBusinessDays?: boolean;
  isStub?: boolean;
};

type Props = {
  cepFieldName: string;
  items: Array<{ variantId: string; qty: number }>;
  freeThresholdCents: number;
  subtotalCents: number;
  onChange: (opt: Option | null) => void;
};

// Watches the sibling <input name={cepFieldName}> and the CEP field outside
// the React tree (since placeOrder lives in a <form>). Debounces requests,
// ignores stale responses. Fires onChange with the chosen option or null.
export function ShippingOptions({
  cepFieldName,
  items,
  freeThresholdCents,
  subtotalCents,
  onChange,
}: Props) {
  const [cep, setCep] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const lastCep = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const freeShipping = freeThresholdCents > 0 && subtotalCents >= freeThresholdCents;

  // Bridge the uncontrolled input to our state.
  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>(`input[name="${cepFieldName}"]`);
    if (!el) return;
    const handler = () => setCep(el.value);
    setCep(el.value);
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
    return () => {
      el.removeEventListener("input", handler);
      el.removeEventListener("change", handler);
    };
  }, [cepFieldName]);

  useEffect(() => {
    const digits = cep.replace(/\D/g, "").slice(0, 8);
    if (digits.length !== 8) {
      setOptions([]);
      setSelected(null);
      onChange(null);
      return;
    }
    if (digits === lastCep.current) return;
    lastCep.current = digits;

    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/shipping/quote", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toCep: digits, items }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Erro ao cotar frete");
          setOptions([]);
          setSelected(null);
          onChange(null);
        } else {
          setOptions(json.options);
          setWarnings(json.warnings ?? []);
          const first = json.options[0] as Option | undefined;
          setSelected(first?.serviceId ?? null);
          onChange(first ? { ...first, priceCents: freeShipping ? 0 : first.priceCents } : null);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Erro");
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [cep, JSON.stringify(items), freeShipping]);

  function pick(opt: Option) {
    setSelected(opt.serviceId);
    onChange({ ...opt, priceCents: freeShipping ? 0 : opt.priceCents });
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Frete</h3>
      {cep.replace(/\D/g, "").length < 8 ? (
        <p className="text-xs text-[color:var(--foreground)]/60">
          Informe o CEP acima para ver as opções.
        </p>
      ) : loading ? (
        <p className="text-xs text-[color:var(--foreground)]/60">Calculando frete…</p>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : warnings.includes("origin_cep_missing") ? (
        <p className="text-xs text-amber-700">
          Endereço de origem ainda não configurado. Peça ao admin preencher em <code>/admin/configuracoes</code>.
        </p>
      ) : options.length === 0 ? (
        <p className="text-xs text-[color:var(--foreground)]/60">Nenhum frete disponível para este CEP.</p>
      ) : (
        <div className="space-y-1">
          {options.map((o) => {
            const active = o.serviceId === selected;
            const price = freeShipping ? 0 : o.priceCents;
            return (
              <button
                key={o.serviceId}
                type="button"
                onClick={() => pick(o)}
                className={`w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between transition-colors ${
                  active
                    ? "border-[color:var(--pink-500)] bg-pink-50"
                    : "border-white/70 bg-white/70 hover:bg-white"
                }`}
              >
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {o.carrier} · {o.name}
                    {o.isStub ? (
                      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        demo
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[color:var(--foreground)]/60">
                    {o.etaDays} {o.etaBusinessDays === false ? "dias" : "dias úteis"}
                  </div>
                </div>
                <div className="text-sm font-semibold text-[color:var(--pink-600)]">
                  {freeShipping ? "Grátis" : formatBRL(price)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

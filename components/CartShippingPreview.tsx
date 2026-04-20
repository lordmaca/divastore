"use client";

import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/money";

const CEP_STORAGE_KEY = "bdd:shippingCep";

type Option = {
  serviceId: string;
  carrier: string;
  name: string;
  priceCents: number;
  etaDays: number;
  isStub?: boolean;
};

type Props = {
  items: Array<{ variantId: string; qty: number }>;
  freeThresholdCents: number;
  subtotalCents: number;
};

// Lightweight CEP-in-cart widget. Not a form field — just a preview before
// the customer reaches checkout, so shipping cost stops being a surprise.
export function CartShippingPreview({ items, freeThresholdCents, subtotalCents }: Props) {
  const [cep, setCep] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the input with a previously-used CEP so the customer doesn't
  // re-type it on every cart visit.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CEP_STORAGE_KEY);
      if (saved && saved.length === 8) {
        setCep(`${saved.slice(0, 5)}-${saved.slice(5)}`);
      }
    } catch {
      // localStorage can throw in some private-mode contexts; ignore.
    }
  }, []);

  const freeShipping = freeThresholdCents > 0 && subtotalCents >= freeThresholdCents;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = cep.replace(/\D/g, "").slice(0, 8);
    if (digits.length !== 8) {
      setError("CEP inválido");
      setOptions(null);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toCep: digits, items }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Erro ao cotar frete");
        setOptions(null);
      } else {
        setOptions(j.options as Option[]);
        if ((j.options as Option[]).length === 0) {
          setError("Sem opções de frete para este CEP");
        }
        try {
          localStorage.setItem(CEP_STORAGE_KEY, digits);
        } catch {
          // ignore storage failures — preview still works this session.
        }
      }
    } catch {
      setError("Não foi possível cotar agora");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          placeholder="Calcular frete — CEP"
          aria-label="CEP para calcular frete"
          pattern="\d{5}-?\d{3}"
          maxLength={9}
          className="flex-1 min-w-0 rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-4"
        >
          {loading ? "…" : "OK"}
        </button>
      </form>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {options && options.length > 0 ? (
        <ul className="text-xs space-y-1">
          {options.slice(0, 3).map((o) => (
            <li key={o.serviceId} className="flex justify-between">
              <span>
                {o.carrier} · {o.name} ({o.etaDays} dias)
              </span>
              <span className="font-semibold text-[color:var(--pink-600)]">
                {freeShipping ? "Grátis" : formatBRL(o.priceCents)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

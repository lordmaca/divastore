"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/cart-actions";
import { formatBRL } from "@/lib/money";
import { variantAxisLabel } from "@/lib/cart/variant-sku";

export type Variant = {
  id: string;
  name: string | null;
  priceCents: number;
  stock: number;
  attributes: Record<string, unknown> | null;
};

// Detect the shared axis across variants. If every variant has the same
// attribute key (`tamanho` OR `material`), we can label the picker by
// axis — matching the DivaHub DM flow which emits variant SKUs keyed on
// those same axes. Mixed / missing attributes → fall back to generic
// "Variante" picker.
type Axis = "tamanho" | "material" | null;

function detectAxis(variants: Variant[]): Axis {
  const axes = new Set<Axis>();
  for (const v of variants) {
    const parsed = variantAxisLabel(v.attributes);
    axes.add(parsed.axis);
  }
  if (axes.size !== 1) return null;
  const only = [...axes][0];
  return only ?? null;
}

const AXIS_COPY: Record<NonNullable<Axis>, string> = {
  tamanho: "Tamanho",
  material: "Acabamento",
};

export function AddToCartForm({ variants }: { variants: Variant[] }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const selected = variants.find((v) => v.id === variantId);
  const oos = !selected || selected.stock < 1;
  const axis = detectAxis(variants);
  const pickerLabel = axis ? AXIS_COPY[axis] : "Variante";

  return (
    <div className="space-y-4">
      {variants.length > 1 ? (
        <div>
          <label className="block text-sm font-medium mb-2">
            {pickerLabel}
            {selected ? (
              <span className="ml-2 text-[color:var(--foreground)]/60 font-normal">
                · {variantButtonLabel(selected, axis)}
              </span>
            ) : null}
          </label>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const active = v.id === variantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  disabled={v.stock < 1}
                  className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                    active
                      ? "bg-[color:var(--pink-500)] text-white border-transparent"
                      : "bg-white/70 hover:bg-white border-white"
                  } ${v.stock < 1 ? "opacity-40 cursor-not-allowed line-through" : ""}`}
                >
                  {variantButtonLabel(v, axis)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="text-3xl font-semibold text-[color:var(--pink-600)]">
        {selected ? formatBRL(selected.priceCents) : "—"}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Qtd</label>
        <div className="inline-flex items-center rounded-full bg-white/70 border border-white">
          <button
            type="button"
            className="w-9 h-9 hover:bg-pink-50 rounded-l-full"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
          >
            −
          </button>
          <span className="w-10 text-center">{qty}</span>
          <button
            type="button"
            className="w-9 h-9 hover:bg-pink-50 rounded-r-full"
            onClick={() => setQty((n) => Math.min(selected?.stock ?? 99, n + 1))}
          >
            +
          </button>
        </div>
        <span className="text-xs text-[color:var(--foreground)]/60">
          {selected?.stock ?? 0} em estoque
        </span>
      </div>

      <button
        type="button"
        disabled={oos || pending}
        onClick={() =>
          start(async () => {
            try {
              await addToCart({ variantId, qty });
              setMsg("Adicionado ao carrinho!");
              router.refresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Erro ao adicionar.");
            }
          })
        }
        className="w-full rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white font-medium px-6 py-3 transition-colors shadow-lg shadow-pink-300/30"
      >
        {pending ? "Adicionando…" : oos ? "Esgotado" : "Adicionar ao carrinho"}
      </button>

      {msg ? <p className="text-sm text-[color:var(--pink-600)]">{msg}</p> : null}
    </div>
  );
}

function variantButtonLabel(v: Variant, axis: Axis): string {
  // When the axis is known, render the value only (e.g. "17", "Dourado")
  // so the buttons in the picker read cleanly. The picker label already
  // says "Tamanho" / "Acabamento".
  const parsed = variantAxisLabel(v.attributes);
  if (axis === "tamanho" && parsed.axis === "tamanho") {
    return parsed.value === "REG" ? "Regulável" : (parsed.value ?? v.name ?? "—");
  }
  if (axis === "material" && parsed.axis === "material") {
    // Strip the "Acabamento " prefix from the full label since the picker
    // title already carries that context.
    return parsed.label?.replace(/^Acabamento\s+/, "") ?? v.name ?? "—";
  }
  return v.name ?? "Único";
}

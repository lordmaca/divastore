"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Renders a dismissible pill from `?toast=<code>` and clears the params
// from the URL on mount so a refresh doesn't re-show the message.
// When `?missing=<label>|<label>` is present alongside, the pill appends
// the specific labels — e.g. "Alguns itens indisponíveis: Tamanho 17,
// Acabamento Dourado."

const BASE: Record<string, { text: string; tone: "ok" | "warn" }> = {
  "dm-cart-added": { text: "Itens da conversa adicionados ao carrinho ✨", tone: "ok" },
  "dm-cart-partial": {
    text: "Alguns itens não estão mais disponíveis — adicionamos os restantes.",
    tone: "warn",
  },
  "dm-cart-empty": {
    text: "Nenhum item dessa conversa está disponível no momento.",
    tone: "warn",
  },
};

export function DeepLinkToast() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("toast");
  const missingRaw = params.get("missing");
  const base = raw ? BASE[raw] : null;

  const [visible, setVisible] = useState(Boolean(base));

  useEffect(() => {
    if (!raw) return;
    const next = new URLSearchParams(params.toString());
    next.delete("toast");
    next.delete("missing");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, [raw, params, pathname, router]);

  if (!base || !visible) return null;

  const missingLabels =
    missingRaw && (raw === "dm-cart-partial" || raw === "dm-cart-empty")
      ? missingRaw
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];

  const detailLine =
    missingLabels.length > 0 ? `Indisponíveis: ${missingLabels.join(", ")}.` : null;

  const toneCls =
    base.tone === "ok"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : "bg-amber-100 text-amber-900 border-amber-200";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)]">
      <div
        className={`rounded-2xl border px-4 py-3 text-sm shadow-lg ${toneCls}`}
        role="status"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p>{base.text}</p>
            {detailLine ? (
              <p className="text-xs opacity-85">{detailLine}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-xs font-semibold hover:underline shrink-0"
          >
            fechar
          </button>
        </div>
      </div>
    </div>
  );
}

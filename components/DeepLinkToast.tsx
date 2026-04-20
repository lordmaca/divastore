"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Renders a dismissible pill from `?toast=<code>` and clears the param
// from the URL on mount so a refresh doesn't re-show the message.
const MESSAGES: Record<string, { text: string; tone: "ok" | "warn" }> = {
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
  const msg = raw ? MESSAGES[raw] : null;

  const [visible, setVisible] = useState(Boolean(msg));

  useEffect(() => {
    if (!raw) return;
    // Strip the param via replace so history doesn't keep the toast state.
    const next = new URLSearchParams(params.toString());
    next.delete("toast");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, [raw, params, pathname, router]);

  if (!msg || !visible) return null;
  const toneCls =
    msg.tone === "ok"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : "bg-amber-100 text-amber-900 border-amber-200";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)]">
      <div
        className={`rounded-full border px-4 py-2 text-sm shadow-lg flex items-center justify-between gap-3 ${toneCls}`}
        role="status"
      >
        <span>{msg.text}</span>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-xs font-semibold hover:underline shrink-0"
        >
          fechar
        </button>
      </div>
    </div>
  );
}

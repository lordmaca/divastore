"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Chat widget — Divinha. Single-file client component: bubble + panel +
// message rendering + SSE consumption + action dispatch. Lazy-loaded from
// (shop) layout so LCP isn't affected.
//
// Protocol reference: lib/integration/divahub/DIVINHA_API_CONTRACT.md

type ProductRef = { slug: string; variantSku?: string; reason?: string };

type AssistantMessage =
  | { id: string; role: "assistant"; kind: "text"; content: string }
  | { id: string; role: "assistant"; kind: "product_carousel"; products: ProductRef[] }
  | { id: string; role: "assistant"; kind: "quick_replies"; prompts: string[] }
  | { id: string; role: "assistant"; kind: "link"; label: string; href: string };

type ChatAction =
  | { type: "add_to_cart"; variantSku: string; qty: number; reason?: string }
  | { type: "remove_from_cart"; variantId: string }
  | { type: "update_cart_qty"; variantId: string; qty: number }
  | { type: "apply_coupon"; code: string }
  | { type: "remove_coupon" }
  | { type: "show_product"; slug: string }
  | { type: "navigate"; path: string }
  | { type: "start_checkout" }
  | { type: "handoff_human"; reason: string }
  | { type: "request_customer_info"; fields: Array<"cep" | "email" | "nome"> };

type UIMessage =
  | {
      id: string;
      role: "user";
      content: string;
      createdAt: number;
    }
  | (AssistantMessage & { createdAt: number; turnId?: string })
  | {
      id: string;
      role: "system";
      kind: "error" | "handoff";
      content: string;
      createdAt: number;
    };

type HydratedProduct = {
  slug: string;
  name: string;
  image: string | null;
  imageAlt: string;
  priceCents: number | null;
  inStock: boolean;
  defaultVariantSku: string | null;
};

const CONSENT_COOKIE = "bd_divinha_consent";
const OPEN_COOKIE = "bd_divinha_open";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name: string, value: string, maxAgeSec = 60 * 60 * 24 * 180) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; sameSite=lax`;
}

function fmtPrice(cents: number | null): string {
  if (cents == null) return "—";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export default function ChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // `null` means hydration was attempted and the ref did not match any active
  // product — the card should be hidden. `undefined` means not yet fetched.
  const [hydrated, setHydrated] = useState<Record<string, HydratedProduct | null>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // --- Persisted open state + LGPD consent on mount -----------------
  useEffect(() => {
    setConsent(readCookie(CONSENT_COOKIE) === "1");
    setOpen(readCookie(OPEN_COOKIE) === "1");
    // Show greeting bubble the first time per session if not opened yet.
    const seen = sessionStorage.getItem("bd_divinha_greet");
    if (!seen && readCookie(OPEN_COOKIE) !== "1") {
      const t = setTimeout(() => setShowGreeting(true), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  // --- Rehydrate thread on first open --------------------------------
  useEffect(() => {
    if (!open || messages.length > 0) return;
    (async () => {
      try {
        const res = await fetch("/api/chat/history", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          conversation: null | {
            externalId: string;
            messages: Array<{
              id: string;
              role: "USER" | "ASSISTANT" | "SYSTEM";
              kind: string;
              content: string | null;
              payload: unknown;
              createdAt: string;
            }>;
          };
        };
        if (!data.conversation) return;
        setConversationId(data.conversation.externalId);
        const ui: UIMessage[] = data.conversation.messages.map((m) => {
          if (m.role === "USER") {
            return {
              id: m.id,
              role: "user",
              content: m.content ?? "",
              createdAt: new Date(m.createdAt).getTime(),
            };
          }
          if (m.kind === "text") {
            return {
              id: m.id,
              role: "assistant",
              kind: "text",
              content: m.content ?? "",
              createdAt: new Date(m.createdAt).getTime(),
            };
          }
          return {
            ...(m.payload as AssistantMessage),
            id: m.id,
            createdAt: new Date(m.createdAt).getTime(),
          };
        });
        setMessages(ui);
      } catch {
        /* silent */
      }
    })();
  }, [open, messages.length]);

  // --- Hydrate product cards whenever a new product_carousel arrives -
  // We key hydration by the SLUG as Divinha emitted it (even when the match
  // comes back via SKU fallback), so the render below can look up what it
  // was given. The hydrated payload carries the CANONICAL storefront slug
  // which we use for navigation.
  useEffect(() => {
    const missingRefs: ProductRef[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      if (m.role !== "assistant" || m.kind !== "product_carousel") continue;
      for (const p of m.products) {
        if (hydrated[p.slug] !== undefined) continue;
        if (seen.has(p.slug)) continue;
        seen.add(p.slug);
        missingRefs.push(p);
      }
    }
    if (missingRefs.length === 0) return;

    fetch("/api/chat/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        refs: missingRefs.map((r) => ({ slug: r.slug, variantSku: r.variantSku })),
      }),
    })
      .then((r) => r.json())
      .then(
        (data: {
          matches: Array<{
            ref: { slug: string; variantSku?: string };
            match: HydratedProduct | null;
          }>;
        }) => {
          setHydrated((prev) => {
            const next = { ...prev };
            for (const m of data.matches) next[m.ref.slug] = m.match;
            return next;
          });
        },
      )
      .catch(() => undefined);
  }, [messages, hydrated]);

  // --- Scroll to bottom on new message -------------------------------
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // --- Esc to close ---------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setShowGreeting(false);
    sessionStorage.setItem("bd_divinha_greet", "1");
    writeCookie(OPEN_COOKIE, "1");
    setTimeout(() => composerRef.current?.focus(), 200);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    writeCookie(OPEN_COOKIE, "0", 60 * 60 * 24 * 30);
  }, []);

  const giveConsent = useCallback(() => {
    writeCookie(CONSENT_COOKIE, "1");
    setConsent(true);
    setTimeout(() => composerRef.current?.focus(), 100);
  }, []);

  const dispatchAction = useCallback(
    async (action: ChatAction, turnId: string | null) => {
      // Client-side navigation for routeable actions. Everything else POSTs
      // to /api/chat/action so the executor can enforce the whitelist.
      if (action.type === "show_product") {
        router.push(`/loja/${action.slug}`);
        return;
      }
      if (action.type === "start_checkout") {
        router.push("/checkout");
        return;
      }
      if (action.type === "navigate") {
        router.push(action.path);
        return;
      }
      if (action.type === "handoff_human") {
        setMessages((m) => [
          ...m,
          {
            id: `sys_${Date.now()}`,
            role: "system",
            kind: "handoff",
            content:
              "Encaminhei essa conversa para uma pessoa do nosso time. Você pode continuar por aqui — a gente responde assim que possível.",
            createdAt: Date.now(),
          },
        ]);
        return;
      }
      if (action.type === "request_customer_info") return;

      try {
        const res = await fetch("/api/chat/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turnId: turnId ?? "unknown",
            conversationId: conversationId ?? "unknown",
            action,
          }),
        });
        if (!res.ok) return;
        if (action.type === "add_to_cart") {
          setToast("Adicionado ao carrinho ✨");
          router.refresh();
          setTimeout(() => setToast(null), 2200);
        } else if (action.type === "apply_coupon") {
          setToast("Cupom aplicado.");
          router.refresh();
          setTimeout(() => setToast(null), 2200);
        }
      } catch {
        /* silent */
      }
    },
    [conversationId, router],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);

    const userMsg: UIMessage = {
      id: `local_${Date.now()}`,
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);

    const referrerPath =
      typeof window !== "undefined" ? window.location.pathname : null;
    const deviceHint: "mobile" | "desktop" =
      typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
        ? "mobile"
        : "desktop";

    let turnId: string | null = null;

    try {
      const res = await fetch("/api/chat/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          conversationId,
          message: { content: text },
          context: { referrerPath, deviceHint },
        }),
      });
      if (!res.ok || !res.body) {
        setMessages((m) => [
          ...m,
          {
            id: `sys_${Date.now()}`,
            role: "system",
            kind: "error",
            content: "Não consegui falar com a Divinha agora. Tente em alguns instantes 💗",
            createdAt: Date.now(),
          },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let evName = "";
      let dataBuf = "";

      const onEvent = (event: string, data: unknown) => {
        if (event === "turn.start") {
          const d = data as { turnId: string; conversationId: string };
          turnId = d.turnId;
          setConversationId(d.conversationId);
        } else if (event === "message") {
          const msg = data as AssistantMessage;
          setMessages((m) => [...m, { ...msg, createdAt: Date.now(), turnId: turnId ?? undefined }]);
        } else if (event === "action") {
          void dispatchAction(data as ChatAction, turnId);
        } else if (event === "error") {
          const d = data as { message: string };
          setMessages((m) => [
            ...m,
            {
              id: `sys_${Date.now()}`,
              role: "system",
              kind: "error",
              content: d.message || "A Divinha teve um imprevisto. Tente de novo 💗",
              createdAt: Date.now(),
            },
          ]);
        }
      };

      // biome-ignore lint: explicit loop
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          if (line === "") {
            if (evName && dataBuf) {
              try {
                onEvent(evName, JSON.parse(dataBuf));
              } catch {
                /* malformed — skip */
              }
            }
            evName = "";
            dataBuf = "";
          } else if (line.startsWith(":")) {
            // heartbeat
          } else if (line.startsWith("event:")) {
            evName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const chunk = line.slice(5).replace(/^ /, "");
            dataBuf = dataBuf ? `${dataBuf}\n${chunk}` : chunk;
          }
        }
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `sys_${Date.now()}`,
          role: "system",
          kind: "error",
          content: "Conexão interrompida. Puxe a página e tente de novo 💗",
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversationId, dispatchAction]);

  // ---------------------- render ----------------------

  return (
    <>
      {/* Bubble (always rendered so CSS transitions are snappy) */}
      {!open ? (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
          {showGreeting ? (
            <button
              type="button"
              onClick={openPanel}
              className="max-w-[220px] rounded-2xl bg-white/90 backdrop-blur px-3.5 py-2.5 text-left text-xs text-[color:var(--foreground)] shadow-lg border border-white/70 hover:shadow-xl transition animate-in fade-in slide-in-from-bottom-2"
            >
              Oi! Posso te ajudar a escolher uma peça ✨
            </button>
          ) : null}
          <div className="relative h-14 w-14">
            {/* Halo rings — two staggered pulses so the ripple feels continuous. */}
            <span
              aria-hidden
              className="divinha-halo pointer-events-none absolute inset-0 rounded-full bg-[color:var(--pink-400)]/50"
            />
            <span
              aria-hidden
              className="divinha-halo pointer-events-none absolute inset-0 rounded-full bg-[color:var(--pink-500)]/40"
              style={{ animationDelay: "1.3s" }}
            />
            <button
              type="button"
              aria-label="Abrir chat com a Divinha"
              onClick={openPanel}
              className="divinha-wink relative h-14 w-14 rounded-full bg-gradient-to-br from-[color:var(--pink-400)] to-[color:var(--pink-600)] text-white shadow-xl hover:scale-110 transition-transform focus:outline-none focus:ring-4 focus:ring-pink-200"
            >
              <span className="divinha-breath absolute inset-0 grid place-items-center">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                  <path
                    d="M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8-1.1 0-2.16-.17-3.13-.48L4 20l.79-3.53C3.67 15.17 3 13.66 3 12c0-4.42 4.03-9 9-9z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  {/* Eyes — help it read as a face/character, not a generic balloon. */}
                  <circle cx="9.2" cy="11" r="1" fill="currentColor" />
                  <circle cx="14.8" cy="11" r="1" fill="currentColor" />
                </svg>
              </span>
              <span
                aria-hidden
                className="sparkle pointer-events-none absolute -top-1 -right-1 text-sm drop-shadow"
              >
                ✨
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Panel */}
      {open ? (
        <div
          role="dialog"
          aria-label="Divinha — assistente de IA"
          className="fixed inset-0 z-50 flex items-end justify-end sm:inset-auto sm:bottom-6 sm:right-6"
        >
          <div className="absolute inset-0 sm:hidden bg-[color:var(--foreground)]/30" onClick={close} />
          <div className="relative flex flex-col w-full sm:w-[380px] h-[100dvh] sm:h-[560px] sm:max-h-[82vh] sm:rounded-3xl bg-white/95 backdrop-blur border border-white/70 shadow-2xl overflow-hidden">
            {/* Header */}
            <header className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--pink-200)]/40 bg-gradient-to-r from-[color:var(--bg-lavender-from)]/60 to-[color:var(--bg-lavender-to)]/60">
              <div className="relative h-9 w-9 rounded-full bg-gradient-to-br from-[color:var(--pink-400)] to-[color:var(--pink-600)] text-white grid place-items-center">
                <span aria-hidden className="text-base">✨</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg leading-none text-[color:var(--pink-600)]">Divinha</p>
                <p className="text-[11px] text-[color:var(--foreground)]/60">Assistente de IA</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fechar chat"
                className="rounded-full p-1.5 hover:bg-white/60"
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            {/* Messages */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
              {messages.length === 0 && consent ? (
                <div className="text-center text-xs text-[color:var(--foreground)]/60 py-8">
                  <p className="font-display text-xl text-[color:var(--pink-600)] mb-1">Olá!</p>
                  <p>Me diga o que você está procurando — anel, colar, brincos, um presente…</p>
                </div>
              ) : null}

              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  hydrated={hydrated}
                  onProductClick={(canonicalSlug) => router.push(`/loja/${canonicalSlug}`)}
                  onAddVariant={(variantSku) =>
                    dispatchAction({ type: "add_to_cart", variantSku, qty: 1 }, null)
                  }
                  onQuickReply={(prompt) => {
                    setDraft(prompt);
                    setTimeout(() => composerRef.current?.focus(), 0);
                  }}
                />
              ))}
              {sending ? <TypingIndicator /> : null}
            </div>

            {/* Toast */}
            {toast ? (
              <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-[color:var(--pink-600)] text-white text-xs px-3 py-1.5 shadow animate-in fade-in">
                {toast}
              </div>
            ) : null}

            {/* Consent / composer */}
            {consent === false ? (
              <div className="border-t border-white/70 px-4 py-3 bg-white/80 text-xs text-[color:var(--foreground)]/80 space-y-2">
                <p>
                  A Divinha é uma assistente de IA. Ao continuar, você aceita o uso de IA para
                  atendimento e o registro da conversa para nossa equipe.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={giveConsent}
                    className="flex-1 rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-xs font-medium px-3 py-2"
                  >
                    Aceitar e começar
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full border border-[color:var(--pink-200)] text-xs px-3 py-2 hover:bg-white"
                  >
                    Agora não
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="border-t border-white/70 px-3 py-2.5 bg-white/80 flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Escreva pra Divinha…"
                  className="flex-1 resize-none max-h-28 rounded-2xl bg-white border border-[color:var(--pink-200)]/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-200"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || sending}
                  aria-label="Enviar"
                  className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white disabled:opacity-40 grid place-items-center"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M3 10l14-7-4 14-3-6-7-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl rounded-tl-sm bg-white/80 w-fit">
      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--pink-400)] animate-bounce" />
      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--pink-400)] animate-bounce [animation-delay:0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--pink-400)] animate-bounce [animation-delay:0.3s]" />
    </div>
  );
}

function MessageBubble(props: {
  message: UIMessage;
  hydrated: Record<string, HydratedProduct | null>;
  onProductClick: (canonicalSlug: string) => void;
  onAddVariant: (variantSku: string) => void;
  onQuickReply: (prompt: string) => void;
}) {
  const m = props.message;

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] bg-[color:var(--pink-500)] text-white text-sm px-3.5 py-2 rounded-2xl rounded-br-sm whitespace-pre-wrap break-words shadow">
          {m.content}
        </div>
      </div>
    );
  }

  if (m.role === "system") {
    const isError = m.kind === "error";
    return (
      <div className="mx-auto max-w-[90%] text-center">
        <p
          className={`inline-block rounded-full px-3 py-1 text-[11px] ${
            isError
              ? "bg-red-100 text-red-800 border border-red-200"
              : "bg-[color:var(--pink-50)] text-[color:var(--pink-600)] border border-[color:var(--pink-200)]/60"
          }`}
        >
          {m.content}
        </p>
      </div>
    );
  }

  // assistant
  if (m.kind === "text") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[86%] bg-white text-[color:var(--foreground)] text-sm px-3.5 py-2 rounded-2xl rounded-tl-sm whitespace-pre-wrap break-words shadow-sm border border-white">
          {m.content}
        </div>
      </div>
    );
  }

  if (m.kind === "product_carousel") {
    // Only render products that successfully hydrated. Anything still
    // loading (undefined) renders a skeleton; anything hydration-missed
    // (null) is hidden entirely — no phantom card with a raw slug.
    const cards = m.products.map((p) => ({ ref: p, h: props.hydrated[p.slug] }));
    const loading = cards.filter((c) => c.h === undefined);
    const matched = cards.filter(
      (c): c is { ref: ProductRef; h: HydratedProduct } => !!c.h,
    );
    if (matched.length === 0 && loading.length === 0) return null;

    return (
      <div className="-mx-1">
        <div className="flex gap-2 overflow-x-auto px-1 pb-1 snap-x">
          {matched.map(({ ref, h }) => (
            <div
              key={ref.slug}
              className="snap-start w-40 shrink-0 rounded-2xl bg-white border border-white overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => props.onProductClick(h.slug)}
                className="block w-full text-left"
              >
                <div className="aspect-square bg-[color:var(--pink-50)] overflow-hidden">
                  {h.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={h.image}
                      alt={h.imageAlt}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-[color:var(--pink-200)]">
                      ✨
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-0.5">
                  <p className="text-[11px] font-medium line-clamp-2 leading-tight">
                    {h.name}
                  </p>
                  <p className="text-xs font-semibold text-[color:var(--pink-600)]">
                    {fmtPrice(h.priceCents)}
                  </p>
                  {ref.reason ? (
                    <p className="text-[10px] text-[color:var(--foreground)]/60 line-clamp-2">
                      {ref.reason}
                    </p>
                  ) : null}
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  const sku = ref.variantSku ?? h.defaultVariantSku;
                  if (sku) props.onAddVariant(sku);
                }}
                disabled={!(ref.variantSku ?? h.defaultVariantSku) || !h.inStock}
                className="w-full text-[11px] font-medium py-1.5 bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white disabled:opacity-40"
              >
                {h.inStock ? "Adicionar" : "Indisponível"}
              </button>
            </div>
          ))}
          {loading.map((c) => (
            <div
              key={`loading-${c.ref.slug}`}
              className="snap-start w-40 shrink-0 rounded-2xl bg-white/60 border border-white overflow-hidden animate-pulse"
            >
              <div className="aspect-square bg-[color:var(--pink-50)]" />
              <div className="p-2 space-y-1">
                <div className="h-2.5 w-3/4 rounded bg-[color:var(--pink-100,#fde1ef)]" />
                <div className="h-2.5 w-1/3 rounded bg-[color:var(--pink-100,#fde1ef)]" />
              </div>
              <div className="h-6 bg-[color:var(--pink-200)]/50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (m.kind === "quick_replies") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {m.prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => props.onQuickReply(p)}
            className="rounded-full bg-white border border-[color:var(--pink-200)] text-xs px-2.5 py-1 hover:bg-[color:var(--pink-50)]"
          >
            {p}
          </button>
        ))}
      </div>
    );
  }

  if (m.kind === "link") {
    return (
      <div className="flex justify-start">
        <a
          href={m.href}
          className="text-xs text-[color:var(--pink-600)] underline"
          target={m.href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
        >
          {m.label}
        </a>
      </div>
    );
  }

  return null;
}

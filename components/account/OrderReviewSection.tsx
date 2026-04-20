"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitReview } from "@/lib/review-actions";

export type OrderReviewItem = {
  productId: string;
  productSlug: string;
  productName: string;
  alreadyReviewed: boolean;
  existingRating: number | null;
};

export function OrderReviewSection({ items }: { items: OrderReviewItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-sm">Avalie os produtos que recebeu</h2>
        <p className="text-xs text-[color:var(--foreground)]/65 mt-1">
          Sua avaliação ajuda outras Divas a escolherem com confiança. ✨
        </p>
      </div>
      <ul className="space-y-4">
        {items.map((it) => (
          <li key={it.productId}>
            <ReviewRow item={it} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewRow({ item }: { item: OrderReviewItem }) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState<string>("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (item.alreadyReviewed) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <div>
          <Link
            href={`/loja/${item.productSlug}`}
            className="font-medium text-[color:var(--pink-600)] hover:underline"
          >
            {item.productName}
          </Link>
          <p className="text-xs text-[color:var(--foreground)]/65">
            Você já avaliou este produto
            {item.existingRating ? ` com ${item.existingRating} estrela${item.existingRating === 1 ? "" : "s"}` : ""}.
          </p>
        </div>
        <Link
          href={`/loja/${item.productSlug}#avaliacoes`}
          className="text-xs text-[color:var(--pink-600)] hover:underline shrink-0"
        >
          Ver
        </Link>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setMsg({ ok: false, text: "Escolha de 1 a 5 estrelas" });
      return;
    }
    start(async () => {
      try {
        await submitReview({
          productId: item.productId,
          productSlug: item.productSlug,
          rating,
          body: body.trim() || undefined,
        });
        setMsg({ ok: true, text: "Avaliação enviada. Obrigada!" });
        router.refresh();
      } catch (err) {
        setMsg({
          ok: false,
          text: err instanceof Error ? err.message : "Erro ao enviar",
        });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/loja/${item.productSlug}`}
          className="text-sm font-medium text-[color:var(--pink-600)] hover:underline"
        >
          {item.productName}
        </Link>
        <StarPicker value={rating} onChange={setRating} disabled={pending} />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Conta o que você achou (opcional)…"
        maxLength={2000}
        rows={2}
        className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || rating < 1}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
        >
          {pending ? "Enviando…" : "Enviar avaliação"}
        </button>
        {msg ? (
          <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number>(0);
  const active = hover || value;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className={`text-xl leading-none transition-transform ${
            n <= active ? "text-amber-400" : "text-[color:var(--foreground)]/25"
          } ${disabled ? "cursor-default" : "hover:scale-110"}`}
          aria-label={`${n} estrela${n === 1 ? "" : "s"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

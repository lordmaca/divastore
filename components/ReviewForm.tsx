"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "@/lib/review-actions";

export function ReviewForm({ productId, productSlug }: { productId: string; productSlug: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <p className="font-medium">Deixe sua avaliação</p>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setRating(i)}
            aria-label={`${i} estrelas`}
            className="text-2xl"
          >
            <span style={{ color: i <= rating ? "var(--pink-500)" : "rgba(0,0,0,0.2)" }}>★</span>
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Conte como foi sua experiência (opcional)"
        className="w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await submitReview({ productId, productSlug, rating, body: body || undefined });
              setMsg("Obrigada pela avaliação!");
              setBody("");
              router.refresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Erro ao enviar.");
            }
          })
        }
        className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white font-medium px-6 py-2"
      >
        {pending ? "Enviando…" : "Enviar avaliação"}
      </button>
      {msg ? <p className="text-sm text-[color:var(--pink-600)]">{msg}</p> : null}
    </div>
  );
}

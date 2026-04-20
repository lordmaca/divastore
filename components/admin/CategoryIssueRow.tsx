"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  applyCategorySuggestionAction,
  dismissCategoryIssueAction,
} from "@/lib/admin-actions";

type Props = {
  issueId: string;
  productId: string;
  productName: string;
  productSlug: string;
  currentCategoryName: string;
  suggestedCategoryName: string;
  confidence: "high" | "medium" | "low";
  score: number;
  matches: Array<{ pattern: string; weight: number }>;
};

const CONFIDENCE_TONE: Record<Props["confidence"], string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-zinc-100 text-zinc-700",
};

const CONFIDENCE_LABEL: Record<Props["confidence"], string> = {
  high: "Alta confiança",
  medium: "Média confiança",
  low: "Baixa confiança",
};

export function CategoryIssueRow(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [dismissing, setDismissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function apply() {
    start(async () => {
      setErr(null);
      try {
        await applyCategorySuggestionAction(p.issueId);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "erro");
      }
    });
  }

  function dismiss() {
    if (reason.trim().length < 3) {
      setErr("Motivo curto demais");
      return;
    }
    start(async () => {
      setErr(null);
      try {
        await dismissCategoryIssueAction(p.issueId, reason);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "erro");
      }
    });
  }

  return (
    <li className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{p.productName}</p>
          <p className="text-xs text-[color:var(--foreground)]/55 font-mono">
            {p.productSlug}
          </p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CONFIDENCE_TONE[p.confidence]}`}>
          {CONFIDENCE_LABEL[p.confidence]} · {p.score} pts
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[color:var(--foreground)]/65">Atual:</span>
        <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full">
          {p.currentCategoryName}
        </span>
        <span className="text-[color:var(--foreground)]/55">→</span>
        <span className="text-[color:var(--foreground)]/65">Sugestão:</span>
        <span className="bg-[color:var(--pink-500)] text-white px-2 py-0.5 rounded-full">
          {p.suggestedCategoryName}
        </span>
      </div>

      {p.matches.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-[color:var(--foreground)]/65">
            ver padrões casados ({p.matches.length})
          </summary>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
            {p.matches.map((m, i) => (
              <li key={i}>
                <span className="text-[color:var(--foreground)]/55">peso {m.weight}:</span>{" "}
                <code className="bg-white/70 px-1.5 rounded">{m.pattern}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {err ? <p className="text-xs text-red-600">{err}</p> : null}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/60">
        <button
          type="button"
          disabled={pending}
          onClick={apply}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
        >
          {pending ? "…" : "Aplicar sugestão"}
        </button>
        {!dismissing ? (
          <button
            type="button"
            onClick={() => setDismissing(true)}
            className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1.5"
          >
            Dispensar
          </button>
        ) : null}
        <Link
          href={`/admin/produtos/${p.productId}`}
          className="ml-auto text-xs text-[color:var(--foreground)]/65 hover:underline self-center"
        >
          Abrir produto →
        </Link>
      </div>

      {dismissing ? (
        <div className="rounded-xl bg-white/70 border border-white/70 p-3 space-y-2">
          <label className="block text-xs">
            <span className="text-[color:var(--foreground)]/70">
              Motivo (ex: nome contém &quot;colar&quot; mas é um porta-colares)
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-pink-200 bg-white px-2 py-1 text-xs"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={dismiss}
              className="rounded-full bg-white hover:bg-pink-50 border border-pink-300 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1"
            >
              {pending ? "…" : "Confirmar dispensa"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissing(false);
                setReason("");
                setErr(null);
              }}
              className="text-xs text-[color:var(--foreground)]/65"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

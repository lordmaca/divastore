"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerTinyStockSync } from "@/lib/admin-actions";

type LastRun = {
  id: string;
  createdAt: Date | string;
  status: string;
  durationMs: number | null;
  error: string | null;
  operation: string;
};

type Props = { lastRun: LastRun | null };

export function TinyStockSyncCard({ lastRun }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  function run(dryRun: boolean) {
    start(async () => {
      setSummary(null);
      setOk(null);
      try {
        const res = await triggerTinyStockSync({ dryRun });
        setOk(res.ok);
        setSummary(res.summary);
        router.refresh();
      } catch (e) {
        setOk(false);
        setSummary(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="border-t border-white/60 pt-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">Sincronização de estoque</h3>
          <p className="text-xs text-[color:var(--foreground)]/65 mt-0.5">
            Puxa o estoque atual do Tiny e alinha com o catálogo. Roda sozinho a cada 30 min.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(true)}
            className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] text-xs font-medium px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "…" : "Simular"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(false)}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-xs font-medium px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "…" : "Sincronizar agora"}
          </button>
        </div>
      </div>

      {summary ? (
        <p
          className={`text-xs ${
            ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {summary}
        </p>
      ) : null}

      {lastRun ? (
        <div className="text-xs text-[color:var(--foreground)]/70 font-mono">
          Última execução:{" "}
          <span className="text-[color:var(--foreground)]">
            {new Date(lastRun.createdAt).toLocaleString("pt-BR")}
          </span>{" "}
          · status <strong>{lastRun.status}</strong>
          {lastRun.durationMs != null ? ` · ${lastRun.durationMs}ms` : ""}
          {lastRun.error ? (
            <span className="block text-red-600 truncate" title={lastRun.error}>
              {lastRun.error.slice(0, 120)}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[color:var(--foreground)]/55 font-mono">
          Última execução: — (nenhuma ainda)
        </p>
      )}
    </div>
  );
}

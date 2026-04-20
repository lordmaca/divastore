"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  runCategoryScanAction,
  applyAllHighConfidenceAction,
} from "@/lib/admin-actions";

export function CategoryScanControls({ openHighCount }: { openHighCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function scan() {
    start(async () => {
      setMsg(null);
      const r = await runCategoryScanAction();
      setMsg(
        `scan: ${r.scanned} produtos · ${r.autoApplied} aplicados · ${r.opened} pendentes · ${r.resolved} resolvidos · ${r.skipped} sem sugestão`,
      );
      router.refresh();
    });
  }

  function applyAll() {
    start(async () => {
      setMsg(null);
      const r = await applyAllHighConfidenceAction();
      setMsg(`${r.applied} sugestões de alta confiança aplicadas`);
      router.refresh();
    });
  }

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={scan}
        className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
      >
        {pending ? "…" : "Rodar scan agora"}
      </button>
      <button
        type="button"
        disabled={pending || openHighCount === 0}
        onClick={applyAll}
        className="rounded-full bg-white/70 hover:bg-white border border-pink-200 text-[color:var(--pink-600)] disabled:opacity-50 text-xs font-medium px-3 py-1.5"
      >
        {pending ? "…" : `Aplicar todas de alta confiança (${openHighCount})`}
      </button>
      {msg ? (
        <span className="text-xs text-[color:var(--foreground)]/70">{msg}</span>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runScanNow } from "@/app/admin/observability/actions";

export function RunScanButton() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function click() {
    start(async () => {
      setMsg(null);
      try {
        const res = await runScanNow();
        setMsg(
          `Scan concluído — ${res.openedOrUpdated} alerta(s) abertos/atualizados, ` +
            `${res.resolvedByRecovery} auto-resolvido(s), ${res.emailsSent} e-mail(s) enviado(s).`,
        );
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro no scan.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
      >
        {busy ? "Escaneando…" : "Rodar scan agora"}
      </button>
      {msg ? (
        <span className="text-xs text-[color:var(--foreground)]/70">{msg}</span>
      ) : null}
    </div>
  );
}

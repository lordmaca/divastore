"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAdminOrderNotifications } from "@/app/admin/observability/actions";

type Config = {
  enabled: boolean;
  recipients: string[];
};

export function AdminOrderNotificationsForm({ initial }: { initial: Config }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recipientsText, setRecipientsText] = useState(initial.recipients.join("\n"));
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    start(async () => {
      setMsg(null);
      const recipients = recipientsText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      try {
        await saveAdminOrderNotifications({ enabled, recipients });
        setMsg({ ok: true, text: "Salvo." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro" });
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>E-mail para a equipe a cada pedido aprovado</span>
      </label>

      <div>
        <label className="block text-sm font-medium mb-1">
          Destinatários (um por linha)
        </label>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          rows={5}
          className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm font-mono"
        />
        <p className="mt-1 text-xs text-[color:var(--foreground)]/60">
          Enviado assim que o pedido transiciona para PAID (webhook do MP ou confirmação
          manual do admin). Idempotente — MP retransmitindo o mesmo evento não gera
          e-mail duplicado.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        {msg ? (
          <span className={`text-xs ${msg.ok ? "text-[color:var(--foreground)]/70" : "text-red-600"}`}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

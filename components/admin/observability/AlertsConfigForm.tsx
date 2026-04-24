"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAlertsConfig } from "@/app/admin/observability/actions";

type Config = {
  enabled: boolean;
  recipients: string[];
  emailCooldownMinutes: number;
  integrationFailureStreak: number;
  backupMaxAgeHours: number;
  cronMaxMissedMultiplier: number;
};

export function AlertsConfigForm({ initial }: { initial: Config }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recipientsText, setRecipientsText] = useState(initial.recipients.join("\n"));
  const [cooldown, setCooldown] = useState(initial.emailCooldownMinutes);
  const [streak, setStreak] = useState(initial.integrationFailureStreak);
  const [backupAge, setBackupAge] = useState(initial.backupMaxAgeHours);
  const [cronMult, setCronMult] = useState(initial.cronMaxMissedMultiplier);
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
        await saveAlertsConfig({
          enabled,
          recipients,
          emailCooldownMinutes: cooldown,
          integrationFailureStreak: streak,
          backupMaxAgeHours: backupAge,
          cronMaxMissedMultiplier: cronMult,
        });
        setMsg({ ok: true, text: "Configuração salva." });
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
        <span>Alertas e e-mails ativados</span>
      </label>

      <div>
        <label className="block text-sm font-medium mb-1">
          Destinatários (um por linha)
        </label>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          rows={4}
          className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm font-mono"
        />
        <p className="mt-1 text-xs text-[color:var(--foreground)]/60">
          Um e-mail por linha. Cada destinatário recebe um envelope separado, então uma
          recusa não derruba os outros.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Cooldown de e-mail (min)"
          hint="Tempo mínimo entre re-envios do MESMO alerta que continua aberto."
          value={cooldown}
          onChange={setCooldown}
          min={5}
          max={1440}
        />
        <Field
          label="Falhas consecutivas p/ disparar (integração)"
          hint="Nº de runs ruins seguidos de uma adapter+operation antes de abrir um alerta."
          value={streak}
          onChange={setStreak}
          min={1}
          max={100}
        />
        <Field
          label="Backup atrasado após (h)"
          hint="Se o último backup diário bem-sucedido ficar mais velho que isso, alerta."
          value={backupAge}
          onChange={setBackupAge}
          min={1}
          max={720}
        />
        <Field
          label="Tolerância de cron (× intervalo)"
          hint="Ex.: cron a cada 30 min × 2 = alerta se nenhum heartbeat em 60 min."
          value={cronMult}
          onChange={setCronMult}
          min={1}
          max={10}
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
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

function Field(p: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{p.label}</span>
      <input
        type="number"
        value={p.value}
        min={p.min}
        max={p.max}
        onChange={(e) => p.onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm"
      />
      {p.hint ? (
        <p className="mt-1 text-xs text-[color:var(--foreground)]/60">{p.hint}</p>
      ) : null}
    </label>
  );
}

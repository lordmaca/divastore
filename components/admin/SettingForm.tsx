"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/lib/settings-actions";
import type { SettingKey } from "@/lib/settings";

type Props = {
  settingKey: SettingKey;
  label: string;
  description: string;
  value: unknown;
};

// Generic key/value editor. Renders a JSON textarea — sufficient for Phase A
// since the value shapes are tiny ({ enabled, message }, { cents }, { units },
// { url }, { hint }). Phase B can replace this with per-key custom widgets.
export function SettingForm({ settingKey, label, description, value }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2));
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setMsg("JSON inválido.");
      return;
    }
    start(async () => {
      try {
        await updateSetting({ key: settingKey, value: parsed });
        setMsg("Salvo!");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-[color:var(--foreground)]/65 font-mono">{settingKey}</p>
        <p className="text-sm text-[color:var(--foreground)]/75 mt-1">{description}</p>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 font-mono text-xs"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {msg ? (
          <span className={msg === "Salvo!" ? "text-emerald-700 text-xs" : "text-red-600 text-xs"}>
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}

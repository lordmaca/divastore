"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSetting } from "@/lib/settings-actions";
import type { SettingKey } from "@/lib/settings";

// Wrapper around the typed settings save flow. Renders header (label +
// description), content (children), and a Salvar button with inline status.
// `getValue()` returns the current form state when Salvar is pressed.
export function SettingCard({
  settingKey,
  label,
  description,
  getValue,
  children,
}: {
  settingKey: SettingKey;
  label: string;
  description: string;
  getValue: () => unknown;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-[color:var(--foreground)]/70 mt-0.5">{description}</p>
      </div>
      <div>{children}</div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            start(async () => {
              try {
                await updateSetting({ key: settingKey, value: getValue() });
                setMsg("Salvo!");
                router.refresh();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Erro ao salvar.");
              }
            });
          }}
          disabled={pending}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5"
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

export function FieldRow({ children, cols = 1 }: { children: React.ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  const grid = cols === 1 ? "" : cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4";
  return <div className={`grid gap-3 ${grid}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[color:var(--foreground)]/75 mb-1">
        {label}
        {hint ? <span className="ml-1 text-[color:var(--foreground)]/55">— {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300";

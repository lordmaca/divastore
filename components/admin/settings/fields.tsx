"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";

// Field primitives for the settings forms. All controlled — the parent
// form component holds the draft state and calls the save action when the
// admin clicks Salvar.

type BaseProps = {
  label: string;
  description?: string;
  required?: boolean;
};

export function TextField(
  p: BaseProps & {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: "text" | "url" | "email" | "tel";
    name?: string;
  },
) {
  return (
    <label className="block">
      <Label text={p.label} required={p.required} />
      <input
        type={p.type ?? "text"}
        name={p.name}
        required={p.required}
        value={p.value}
        placeholder={p.placeholder}
        onChange={(e) => p.onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
      />
      {p.description ? <Hint text={p.description} /> : null}
    </label>
  );
}

export function NumberField(
  p: BaseProps & {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
  },
) {
  return (
    <label className="block">
      <Label text={p.label} required={p.required} />
      <div className="mt-1 flex items-stretch">
        <input
          type="number"
          value={Number.isFinite(p.value) ? p.value : ""}
          min={p.min}
          max={p.max}
          step={p.step ?? 1}
          onChange={(e) => {
            const n = e.target.value === "" ? Number.NaN : Number(e.target.value);
            p.onChange(Number.isFinite(n) ? n : 0);
          }}
          className="flex-1 min-w-0 rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
        />
        {p.suffix ? (
          <span className="ml-2 self-center text-xs text-[color:var(--foreground)]/60">
            {p.suffix}
          </span>
        ) : null}
      </div>
      {p.description ? <Hint text={p.description} /> : null}
    </label>
  );
}

export function ToggleField(
  p: BaseProps & { value: boolean; onChange: (v: boolean) => void },
) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium">{p.label}</p>
        {p.description ? (
          <p className="text-xs text-[color:var(--foreground)]/65 mt-0.5">{p.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={p.value}
        onClick={() => p.onChange(!p.value)}
        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          p.value ? "bg-[color:var(--pink-500)]" : "bg-zinc-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            p.value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function SelectField<T extends string>(
  p: BaseProps & {
    value: T;
    onChange: (v: T) => void;
    options: Array<{ value: T; label: string }>;
  },
) {
  return (
    <label className="block">
      <Label text={p.label} required={p.required} />
      <select
        value={p.value}
        onChange={(e) => p.onChange(e.target.value as T)}
        className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
      >
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {p.description ? <Hint text={p.description} /> : null}
    </label>
  );
}

// Write-only secret field. Never pre-fills plaintext. When a secret is
// already stored, shows `••••last4` + [ Alterar ] button. Clicking reveals
// a fresh input that only goes to the server on explicit save.
export function SecretField(p: {
  label: string;
  description?: string;
  configured: boolean;
  last4: string | null;
  source: "db" | null;
  // Called when the admin submits a new value. Parent should call the
  // saveSecretAction server action.
  onSave: (plaintext: string) => Promise<void>;
  // Called when the admin clears the stored value. Parent calls clearSecret.
  onClear: () => Promise<void>;
  required?: boolean;
}) {
  const [editing, setEditing] = useState(!p.configured);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  async function submit() {
    if (draft.length < 4) {
      setOk(false);
      setMsg("Valor muito curto");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await p.onSave(draft);
      setDraft("");
      setEditing(false);
      setOk(true);
      setMsg("Salvo com sucesso");
    } catch (e) {
      setOk(false);
      setMsg(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setMsg(null);
    try {
      await p.onClear();
      setDraft("");
      setEditing(true);
      setOk(true);
      setMsg("Removido");
    } catch (e) {
      setOk(false);
      setMsg(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="block">
      <div className="flex items-center justify-between gap-2">
        <Label text={p.label} required={p.required} />
      </div>

      {!editing && p.configured ? (
        <div className="mt-1 flex gap-2 items-stretch">
          <div className="flex-1 min-w-0 rounded-xl bg-white/60 border border-dashed border-pink-200 px-3 py-2 text-sm font-mono text-[color:var(--foreground)]/70 flex items-center gap-2">
            <span>{"•".repeat(10)}</span>
            {p.last4 ? (
              <span className="text-[color:var(--foreground)]/50">…{p.last4}</span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="rounded-xl bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3"
          >
            Alterar
          </button>
          {p.source === "db" ? (
            <button
              type="button"
              disabled={busy}
              onClick={clear}
              className="rounded-xl bg-white/80 hover:bg-white border border-red-200 text-red-700 text-xs font-medium px-3"
            >
              Remover
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 space-y-2">
          <input
            type="password"
            autoComplete="new-password"
            value={draft}
            placeholder={p.configured ? "Digite o novo valor" : "Cole o token aqui"}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300 font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || draft.length < 4}
              onClick={submit}
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
            >
              {busy ? "…" : "Salvar"}
            </button>
            {p.configured ? (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setEditing(false);
                  setMsg(null);
                }}
                className="text-xs text-[color:var(--foreground)]/65"
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </div>
      )}

      {p.description ? <Hint text={p.description} /> : null}
      {msg ? (
        <p className={`mt-1 text-xs ${ok ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>
      ) : null}
    </div>
  );
}

// --- internals ---

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <span className="text-sm font-medium flex items-center gap-1">
      {text}
      {required ? <span className="text-[color:var(--pink-500)]">*</span> : null}
    </span>
  );
}

function Hint({ text }: { text: string }) {
  return <p className="mt-1 text-xs text-[color:var(--foreground)]/60">{text}</p>;
}

// Small helper for composing multi-field forms. Wraps children in a grid.
export function FieldGrid({
  cols = 2,
  children,
}: {
  cols?: 1 | 2 | 3;
  children: ReactNode;
}) {
  const cls =
    cols === 1 ? "grid gap-3" : cols === 3 ? "grid sm:grid-cols-3 gap-3" : "grid sm:grid-cols-2 gap-3";
  return <div className={cls}>{children}</div>;
}

// Controlled input hook helper for forms that mix plain and secret fields.
export function useDraft<T extends Record<string, unknown>>(initial: T) {
  const [draft, setDraft] = useState(initial);
  const patch = (k: keyof T, v: T[keyof T]) => setDraft((d) => ({ ...d, [k]: v }));
  const reset = (fresh: T) => setDraft(fresh);
  // Intentionally no generic: parent compares draft vs initial themselves.
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  return { draft, patch, setDraft, reset, dirty };
}

// Avoid unused-import lint when `ChangeEvent` isn't directly referenced.
export type { ChangeEvent };

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateDivahubKey, revokeDivahubKey } from "@/lib/divahub-key-actions";

type StoredKey = {
  id: string;
  hint: string;
  prefix: string;
  label?: string;
  addedAt: string;
};

export function DivahubKeyManager({ keys }: { keys: StoredKey[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [justGenerated, setJustGenerated] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onGenerate() {
    setErr(null);
    start(async () => {
      try {
        const r = await generateDivahubKey(label);
        setJustGenerated(r.token);
        setLabel("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  function onRevoke(id: string) {
    if (!confirm("Revogar essa chave? Pedidos em andamento no DivaHub usando-a vão falhar.")) return;
    start(async () => {
      await revokeDivahubKey(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[color:var(--foreground)]/75">
        Chaves extras aceitas no endpoint <code className="text-xs">/api/integrations/divahub/*</code>, além
        das definidas em <code className="text-xs">DIVAHUB_INBOUND_API_KEY</code>. Alterações valem em até 60s
        (TTL do cache de settings) — sem reload de PM2.
      </p>

      {justGenerated ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">Copie a chave agora — ela não será mostrada de novo.</p>
          <code className="block mt-2 break-all font-mono text-xs bg-white/70 rounded p-2">
            {justGenerated}
          </code>
          <button
            type="button"
            onClick={() => setJustGenerated(null)}
            className="mt-2 text-xs text-amber-900 underline"
          >
            ok, anotei
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="block text-xs font-medium mb-1">Nome/descrição (opcional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex: divahub-prod-2026"
            className="w-full rounded-xl bg-white/80 border border-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={onGenerate}
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
        >
          {pending ? "…" : "Gerar nova chave"}
        </button>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {keys.length === 0 ? (
        <p className="text-sm text-[color:var(--foreground)]/60">
          Nenhuma chave via UI. Suas chaves via env ainda funcionam.
        </p>
      ) : (
        <ul className="divide-y divide-white/60 rounded-xl bg-white/60 overflow-hidden border border-white/60">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-mono text-xs">{k.hint}</p>
                <p className="text-xs text-[color:var(--foreground)]/60">
                  {k.label ?? "(sem nome)"} · criada {new Date(k.addedAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRevoke(k.id)}
                className="rounded-full bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium px-3 py-1"
              >
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import {
  SettingsSection,
  StatusStrip,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";

type Row = {
  label: string;
  envVar: string;
  configured: boolean;
  hint?: string;
  rotateWarning?: string;
};

type Props = {
  rows: Row[];
  encryptionKeyOk: boolean;
};

// Bootstrap tab — shows the 4 vars that MUST stay in .env.local. Read-only
// by design. Rotating any of these requires an operator with shell access
// (which is the point — these are the recovery vectors if the admin UI
// itself breaks).
export function BootstrapTab(p: Props) {
  return (
    <div className="space-y-5">
      <TabHeader
        title="Bootstrap (env)"
        description="Variáveis que ficam em .env.local por design — necessárias antes do servidor conseguir ler o banco ou descriptografar o resto da configuração. Não podem ser alteradas por aqui."
      />

      <StatusStrip
        ok={p.encryptionKeyOk ? true : false}
        label={
          p.encryptionKeyOk
            ? "Chave mestra de criptografia configurada"
            : "SETTINGS_ENCRYPTION_KEY ausente — secrets não podem ser salvos via UI"
        }
        detail={
          p.encryptionKeyOk
            ? undefined
            : "Gere com `openssl rand -hex 32` e adicione ao .env.local como SETTINGS_ENCRYPTION_KEY."
        }
      />

      <SettingsSection
        title="Variáveis obrigatórias no env"
        description="Perder qualquer uma delas deixa o site offline. Documente cuidadosamente antes de rotacionar."
      >
        <ul className="divide-y divide-white/60">
          {p.rows.map((r) => (
            <li key={r.envVar} className="py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    r.configured ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-[color:var(--foreground)]/55 font-mono">
                    {r.envVar}
                  </p>
                </div>
                <span className="text-xs font-mono text-[color:var(--foreground)]/60">
                  {r.configured ? (r.hint ?? "definido") : "FALTANDO"}
                </span>
              </div>
              {r.rotateWarning ? (
                <p className="text-[11px] text-amber-700 mt-1 pl-5">⚠ {r.rotateWarning}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}

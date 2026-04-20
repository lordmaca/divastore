"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsSection,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import { ToggleField } from "@/components/admin/settings/fields";
import { saveSettingAction } from "@/lib/admin-actions";

type Props = {
  autoApplyEnabled: boolean;
  rulesSummary: Array<{ categorySlug: string; patternCount: number }>;
  openIssues: number;
};

export function CatalogTab(p: Props) {
  const router = useRouter();
  const [autoApply, setAutoApply] = useState(p.autoApplyEnabled);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  const dirty = autoApply !== p.autoApplyEnabled;

  function save() {
    start(async () => {
      setMsg(null);
      try {
        await saveSettingAction("catalog.autoApplyHighConfidence", { enabled: autoApply });
        setOk(true);
        setMsg("Salvo.");
        router.refresh();
      } catch (e) {
        setOk(false);
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="space-y-5">
      <TabHeader
        title="Catálogo — classificador de categorias"
        description="Mantém produtos na categoria certa via regras baseadas no nome. Casos de alta confiança são movidos automaticamente; média/baixa ficam para revisão em /admin/produtos/categorias."
      />

      <SettingsSection title="Comportamento">
        <ToggleField
          label="Aplicar sugestões de alta confiança automaticamente"
          description="Quando ligado, o scan diário (04:00 BRT) move produtos sem intervenção. Desligue se quiser revisar tudo manualmente."
          value={autoApply}
          onChange={setAutoApply}
        />
        <div className="flex items-center gap-3 pt-2 border-t border-white/60">
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={save}
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5"
          >
            {pending ? "…" : "Salvar"}
          </button>
          {msg ? (
            <span className={`text-xs ${ok ? "text-emerald-700" : "text-red-600"}`}>
              {msg}
            </span>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Regras ativas"
        description="Resumo da configuração atual. Edição direta do JSON avançado pode ser feita via psql até a UI de regras ser liberada."
      >
        <ul className="space-y-1 text-sm">
          {p.rulesSummary.map((r) => (
            <li key={r.categorySlug} className="flex items-center justify-between">
              <span className="font-mono text-xs">{r.categorySlug}</span>
              <span className="text-xs text-[color:var(--foreground)]/60">
                {r.patternCount} padrão{r.patternCount === 1 ? "" : "es"}
              </span>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Fila de revisão">
        <p className="text-sm">
          <strong>{p.openIssues}</strong> produto{p.openIssues === 1 ? "" : "s"} aguardando decisão.
        </p>
        <Link
          href="/admin/produtos/categorias"
          className="mt-2 inline-block rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-xs font-medium px-3 py-1.5"
        >
          Abrir fila
        </Link>
      </SettingsSection>
    </div>
  );
}

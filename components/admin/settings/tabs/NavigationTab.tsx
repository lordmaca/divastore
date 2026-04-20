"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SettingsSection,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import { saveSettingAction } from "@/lib/admin-actions";

type Category = { slug: string; name: string; productCount: number };

type Props = {
  allCategories: Category[];
  hiddenSlugs: string[];
};

export function NavigationTab(p: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(new Set(p.hiddenSlugs));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  function toggle(slug: string) {
    const next = new Set(hidden);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setHidden(next);
  }

  function save() {
    start(async () => {
      setMsg(null);
      try {
        await saveSettingAction("navigation.hiddenCategorySlugs", {
          slugs: [...hidden].sort(),
        });
        setOk(true);
        setMsg("Salvo. O menu atualiza no próximo carregamento.");
        router.refresh();
      } catch (e) {
        setOk(false);
        setMsg(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  const dirty =
    JSON.stringify([...hidden].sort()) !== JSON.stringify([...p.hiddenSlugs].sort());

  return (
    <div className="space-y-5">
      <TabHeader
        title="Navegação"
        description="Controle quais categorias aparecem no menu do topo e no rodapé. Categorias ocultas continuam acessíveis via URL direta /loja?categoria=<slug>."
      />
      <SettingsSection
        title="Categorias visíveis no menu"
        description="Toque para ocultar. Categorias sem produtos ativos não aparecem mesmo quando marcadas visíveis."
      >
        <ul className="grid sm:grid-cols-2 gap-2">
          {p.allCategories.map((c) => {
            const isHidden = hidden.has(c.slug);
            return (
              <li key={c.slug}>
                <button
                  type="button"
                  onClick={() => toggle(c.slug)}
                  className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition-colors ${
                    isHidden
                      ? "border-zinc-200 bg-white/40 text-[color:var(--foreground)]/55 line-through"
                      : "border-[color:var(--pink-500)] bg-pink-50 text-[color:var(--foreground)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-[color:var(--foreground)]/55">
                      {c.productCount} ativos
                    </span>
                  </div>
                  <span className="block text-xs font-mono text-[color:var(--foreground)]/50 mt-0.5">
                    {c.slug}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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
    </div>
  );
}

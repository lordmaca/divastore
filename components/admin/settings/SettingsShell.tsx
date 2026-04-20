"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export type SettingsTab = {
  slug: string;
  label: string;
  icon?: string;        // small emoji/label suffix
  muted?: boolean;      // visual de-emphasis for "pending migration" tabs
  badge?: string;       // e.g. "em breve"
  section?: "integrações" | "loja" | "avançado";
};

type Props = {
  tabs: SettingsTab[];
  children: ReactNode;
  activeSlug: string;
};

// Left-rail tab shell. Active tab is driven by URL (?tab=<slug>) so the
// admin can share deep links and the browser back button works. Body
// content is rendered by the parent server component based on the slug.
export function SettingsShell({ tabs, children, activeSlug }: Props) {
  const grouped: Record<string, SettingsTab[]> = {};
  for (const t of tabs) {
    const section = t.section ?? "integrações";
    grouped[section] ??= [];
    grouped[section].push(t);
  }
  const sectionLabels: Record<string, string> = {
    integrações: "Integrações",
    loja: "Loja",
    avançado: "Avançado",
  };

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-6">
      <aside className="lg:sticky lg:top-20 lg:h-fit">
        <nav className="space-y-4 text-sm">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section}>
              <p className="text-[10px] uppercase tracking-wide text-[color:var(--foreground)]/55 mb-1 pl-3">
                {sectionLabels[section] ?? section}
              </p>
              <ul className="space-y-0.5">
                {items.map((t) => {
                  const active = t.slug === activeSlug;
                  return (
                    <li key={t.slug}>
                      <Link
                        href={`/admin/configuracoes?tab=${t.slug}`}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 transition-colors ${
                          active
                            ? "bg-[color:var(--pink-500)] text-white"
                            : t.muted
                              ? "text-[color:var(--foreground)]/55 hover:bg-white/60"
                              : "text-[color:var(--foreground)]/80 hover:bg-white/60"
                        }`}
                      >
                        <span className="truncate">
                          {t.icon ? <span className="mr-1.5">{t.icon}</span> : null}
                          {t.label}
                        </span>
                        {t.badge ? (
                          <span
                            className={`text-[10px] px-1.5 rounded-full ${
                              active
                                ? "bg-white/25 text-white"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {t.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}

export function StatusStrip({
  ok,
  label,
  detail,
}: {
  ok: boolean | "partial";
  label: string;
  detail?: string;
}) {
  const tone =
    ok === true
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : ok === "partial"
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : "bg-red-50 border-red-200 text-red-900";
  const icon = ok === true ? "●" : ok === "partial" ? "◐" : "○";
  return (
    <div className={`rounded-2xl border p-3 flex items-center gap-3 ${tone}`}>
      <span className="text-lg leading-none">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {detail ? <p className="text-xs truncate">{detail}</p> : null}
      </div>
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-[color:var(--foreground)]/65">
            {title}
          </h3>
          {description ? (
            <p className="text-xs text-[color:var(--foreground)]/65 mt-1">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function TabHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header>
      <h2 className="font-display text-3xl text-[color:var(--pink-600)]">{title}</h2>
      {description ? (
        <p className="text-sm text-[color:var(--foreground)]/70 mt-1">{description}</p>
      ) : null}
    </header>
  );
}

export function useActiveTab(defaultSlug: string): string {
  const sp = useSearchParams();
  return sp.get("tab") ?? defaultSlug;
}

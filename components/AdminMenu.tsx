"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adminSignOut } from "@/lib/auth-actions";

// Compact admin shortcut shown only when the logged-in user has role ADMIN.
// The Header decides whether to render this — this component assumes it
// shouldn't exist for non-admins.
export function AdminMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change so the menu isn't stuck open mid-navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu do administrador"
        className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/60 hover:bg-white border border-white/70 shadow-sm text-[color:var(--pink-600)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
      >
        <GearIcon />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Administração"
          className="glass-card absolute right-0 mt-2 w-56 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-white/60"
        >
          <div className="py-1">
            <Item href="/admin">Admin Central</Item>
            <Item href="/admin/integrations">Integrações</Item>
            <Item href="/admin/agents">Agentes</Item>
            <Item href="/admin/configuracoes">Configurações</Item>
          </div>
          <form action={adminSignOut} className="py-1">
            <button
              role="menuitem"
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-[color:var(--foreground)]/80 hover:bg-white/70 hover:text-[color:var(--pink-600)]"
            >
              Sair do admin
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Item({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      role="menuitem"
      href={href}
      className="block px-3 py-2 text-sm text-[color:var(--foreground)]/85 hover:bg-white/70 hover:text-[color:var(--pink-600)]"
    >
      {children}
    </Link>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.82 2.82l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.25 16.98l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.25l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.65c.6.25 1.3.12 1.77-.34l.06-.06a2 2 0 1 1 2.82 2.82l-.06.06A1.7 1.7 0 0 0 19.35 9c.25.6.86 1.01 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </svg>
  );
}

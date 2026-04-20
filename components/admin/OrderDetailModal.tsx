"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Client shell rendered by the intercepting-route slot. Wraps the server
// <OrderDetailView> in a centered overlay (bottom sheet on mobile).
// Closing navigates `router.back()` so the list page takes over again.
export function OrderDetailModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) router.back();
  }

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm px-0 sm:px-4 py-0 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do pedido"
    >
      <div
        ref={dialogRef}
        className="relative w-full sm:max-w-5xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden sm:rounded-3xl rounded-t-3xl shadow-2xl border border-white/70 bg-white"
      >
        {/* Brand-matching soft wash behind the scrollable content. Solid
            white underneath guarantees the modal never looks transparent
            against the dark backdrop. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(at 20% 10%, var(--bg-lavender-from) 0%, transparent 55%), radial-gradient(at 80% 90%, var(--bg-lavender-to) 0%, transparent 55%), linear-gradient(180deg, #ffffff 0%, #fdf4ff 100%)",
          }}
        />
        <div className="relative h-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 bg-white/95 backdrop-blur border-b border-pink-100">
            <p className="text-xs uppercase tracking-wide text-[color:var(--foreground)]/60">
              Gerenciar pedido
            </p>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => router.back()}
              className="rounded-full bg-white hover:bg-pink-50 border border-pink-200 text-[color:var(--pink-600)] w-8 h-8 flex items-center justify-center text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="p-5 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

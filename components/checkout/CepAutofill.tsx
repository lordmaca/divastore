"use client";

import { useEffect } from "react";

// Finds the named CEP input, debounces blur/change, calls ViaCEP via our
// server proxy (to avoid CORS/DNS issues during SSR), and writes results into
// the sibling address fields. Noop if the target fields aren't found.
export function CepAutofill({
  cepFieldName,
  targets,
}: {
  cepFieldName: string;
  targets: { street: string; district: string; city: string; state: string };
}) {
  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>(`input[name="${cepFieldName}"]`);
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const byName = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`);

    async function look() {
      const digits = el!.value.replace(/\D/g, "").slice(0, 8);
      if (digits.length !== 8) return;
      try {
        const res = await fetch(`/api/shipping/cep/${digits}`);
        if (!res.ok) return;
        const j = (await res.json()) as {
          ok: boolean;
          street?: string;
          district?: string;
          city?: string;
          state?: string;
        };
        if (!j.ok) return;
        // Always overwrite auto-fillable fields when the CEP changes — a new
        // CEP implies a different address, so keeping the previous street /
        // city / UF would be wrong. "number" and "complement" stay intact
        // since they're never autofilled.
        const s = byName(targets.street);
        const d = byName(targets.district);
        const c = byName(targets.city);
        const u = byName(targets.state);
        if (s) s.value = j.street ?? "";
        if (d) d.value = j.district ?? "";
        if (c) c.value = j.city ?? "";
        if (u) u.value = (j.state ?? "").toUpperCase();
      } catch {
        // silent — address is still user-editable
      }
    }

    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(look, 350);
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("input", handler);
      el.removeEventListener("change", handler);
    };
  }, [cepFieldName, targets.street, targets.district, targets.city, targets.state]);

  return null;
}

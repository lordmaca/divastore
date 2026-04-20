import type { AdapterHealth, ShippingProvider, ShippingQuoteInput, ShippingOption } from "../../types";
import { loadMelhorEnvioConfig, meCalculate } from "./client";

// Stub fallback: when ME token is unset, still return plausible options
// so the checkout UX is reviewable end-to-end. Every stub row is flagged
// `isStub: true` so the UI can show a "demo" badge if desired.
//
// Distances are faked by the first digit of the destination CEP (region).
function stubOptions(input: ShippingQuoteInput): ShippingOption[] {
  const weightKg = input.packages.reduce((w, p) => w + (p.weightG / 1000) * p.quantity, 0);
  const regionFactor = Math.max(1, Math.min(5, Number(input.toCep.slice(0, 1)) || 3));
  const base = Math.max(1200, Math.round(800 * regionFactor + weightKg * 1500));
  return [
    { serviceId: "stub-pac", carrier: "Correios", name: "PAC (demo)", priceCents: base, etaDays: 7 + regionFactor, isStub: true },
    { serviceId: "stub-sedex", carrier: "Correios", name: "SEDEX (demo)", priceCents: Math.round(base * 1.8), etaDays: 3 + regionFactor, isStub: true },
    { serviceId: "stub-jadlog", carrier: "Jadlog", name: ".Com (demo)", priceCents: Math.round(base * 1.2), etaDays: 4 + regionFactor, isStub: true },
  ];
}

export const melhorEnvio: ShippingProvider = {
  name: "melhorenvio",

  async isEnabled() {
    const cfg = await loadMelhorEnvioConfig();
    return Boolean(cfg.accessToken);
  },

  async health(): Promise<AdapterHealth> {
    const cfg = await loadMelhorEnvioConfig();
    if (!cfg.accessToken) {
      return { ok: false, detail: `not configured (stub, env=${cfg.env})`, checkedAt: new Date() };
    }
    return { ok: true, detail: `configured (env=${cfg.env})`, checkedAt: new Date() };
  },

  async quote(input: ShippingQuoteInput): Promise<ShippingOption[]> {
    const cfg = await loadMelhorEnvioConfig();
    if (!cfg.accessToken) return stubOptions(input);

    const rows = await meCalculate({
      from: { postal_code: input.fromCep.replace(/\D/g, "") },
      to: { postal_code: input.toCep.replace(/\D/g, "") },
      products: input.packages.map((p, idx) => ({
        id: String(idx + 1),
        width: p.widthCm,
        height: p.heightCm,
        length: p.lengthCm,
        weight: p.weightG / 1000,
        insurance_value: (input.insuranceValueCents ?? 0) / 100,
        quantity: p.quantity,
      })),
      options: { insurance_value: (input.insuranceValueCents ?? 0) / 100 },
    });

    return rows
      .filter((r) => !r.error && r.price != null)
      .map<ShippingOption>((r) => ({
        serviceId: String(r.id),
        carrier: r.company?.name ?? "—",
        name: r.name,
        priceCents: Math.round(Number(r.price) * 100),
        etaDays: r.delivery_time ?? 0,
        etaBusinessDays: true,
      }));
  },
};

// Melhor Envio HTTP client. Lives here so the provider stays focused on the
// storefront's types; this file knows about MelhorEnvio's wire format.
//
// Docs: https://docs.melhorenvio.com.br/
// Sandbox base: https://sandbox.melhorenvio.com.br/api/v2
// Prod base:    https://melhorenvio.com.br/api/v2
//
// Single shop = Personal Access Token, not OAuth2 Application.
// Generate in Melhor Envio → Configurações → Gerar Token with scopes:
// shipping-calculate, shipping-cart, shipping-checkout, shipping-generate,
// shipping-print, shipping-tracking.
//
// Config resolution: encrypted secret (`melhorenvio.token`) + plain setting
// (`melhorenvio.env`) from SettingsKv. Edit via /admin/configuracoes → Logística.

import { getSecret } from "@/lib/settings/config";
import { getSetting } from "@/lib/settings";

export type MelhorEnvioConfig = {
  accessToken: string;
  env: "sandbox" | "production";
  baseUrl: string;
};

export async function loadMelhorEnvioConfig(): Promise<MelhorEnvioConfig> {
  const [accessToken, envSetting] = await Promise.all([
    getSecret("melhorenvio.token"),
    getSetting("melhorenvio.env"),
  ]);
  const envResolved: "sandbox" | "production" =
    envSetting.env === "production" ? "production" : "sandbox";
  return {
    accessToken: accessToken ?? "",
    env: envResolved,
    baseUrl:
      envResolved === "production"
        ? "https://melhorenvio.com.br/api/v2"
        : "https://sandbox.melhorenvio.com.br/api/v2",
  };
}

// Melhor Envio requires a User-Agent with contact info — without it they
// rate-limit aggressively. We expose the storefront host + a contact mailbox.
const UA = "BrilhoDeDivaStorefront/1.0 (contato@brilhodediva.com.br)";

export class MelhorEnvioError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "MelhorEnvioError";
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = await loadMelhorEnvioConfig();
  if (!cfg.accessToken) throw new MelhorEnvioError("Melhor Envio not configured");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${cfg.accessToken}`,
      "User-Agent": UA,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new MelhorEnvioError(`ME ${res.status} on ${path}: ${body.slice(0, 200)}`, res.status);
  }
  return res.json() as Promise<T>;
}

// Melhor Envio /me/shipment/calculate — returns an array of service options
// (one per carrier+speed). Each option has { id, name, company, price, delivery_time, … }.
export type MeCalculateRequest = {
  from: { postal_code: string };
  to: { postal_code: string };
  products?: Array<{ id: string; width: number; height: number; length: number; weight: number; insurance_value: number; quantity: number }>;
  options?: { insurance_value?: number; receipt?: boolean; own_hand?: boolean };
};

export type MeCalculateResponseItem = {
  id: number | string;
  name: string;
  price: string | number;
  custom_price?: string | number;
  discount?: string | number;
  delivery_time: number;
  delivery_range?: { min: number; max: number };
  company?: { id: number; name: string };
  error?: string;
};

export async function meCalculate(input: MeCalculateRequest): Promise<MeCalculateResponseItem[]> {
  return call<MeCalculateResponseItem[]>("/me/shipment/calculate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Melhor Envio label-purchase endpoints. Separated from `client.ts` so the
// existing calculate-only flow stays lean for the hot cart/checkout path.
//
// Full flow (per ME docs):
//   POST /me/cart              → add shipment to cart, returns cart item id
//   POST /me/shipment/checkout → pay w/ ME balance, returns purchase
//   POST /me/shipment/generate → tell ME to generate the DANFE-ready label
//   POST /me/shipment/print    → get the PDF URL
//   POST /me/shipment/tracking → get the carrier tracking code
//
// All four accept `{ orders: [<shipmentId>] }` for the post-cart endpoints.
// ME sometimes takes 2-5s to generate labels, so callers poll / retry.

import { MelhorEnvioError, loadMelhorEnvioConfig } from "./client";

const UA = "BrilhoDeDivaStorefront/1.0 (contato@brilhodediva.com.br)";

async function call<T>(path: string, init: RequestInit): Promise<T> {
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
    throw new MelhorEnvioError(
      `ME ${res.status} on ${path}: ${body.slice(0, 300)}`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export type MeAddToCartInput = {
  service: number | string;          // ME serviceId (numeric on the calculate response)
  from: MeAddress;
  to: MeAddress;
  products: Array<{
    name: string;
    quantity: number;
    unitary_value: number;            // reais
  }>;
  volumes: Array<{
    height: number;
    width: number;
    length: number;
    weight: number;                   // kg
  }>;
  options: {
    insurance_value: number;          // reais
    receipt?: boolean;
    own_hand?: boolean;
    reverse?: boolean;
    non_commercial?: boolean;
    invoice?: { key?: string; number?: string };
    platform?: string;
    tags?: Array<{ tag: string; url?: string | null }>;
  };
};

export type MeAddress = {
  name: string;
  phone?: string;
  email?: string;
  document?: string;                  // CPF/CNPJ numbers-only
  address: string;
  complement?: string;
  number: string;
  district: string;
  city: string;
  state_abbr: string;                 // UF
  country_id?: string;                // defaults to BR
  postal_code: string;                // 8 digits
};

export type MeCartItem = {
  id: string;
  protocol?: string;
  price?: string | number;
  status?: string;
};

export async function meAddToCart(input: MeAddToCartInput): Promise<MeCartItem> {
  return call<MeCartItem>("/me/cart", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

type Purchase = {
  id?: string;
  purchase?: { id: string };
  orders?: Array<{ id: string; status?: string }>;
};

export async function meCheckout(shipmentIds: string[]): Promise<Purchase> {
  return call<Purchase>("/me/shipment/checkout", {
    method: "POST",
    body: JSON.stringify({ orders: shipmentIds }),
  });
}

// ME's generate returns a map keyed by shipment id.
type GenerateResponse = Record<string, { status?: string; generated?: boolean; message?: string }>;

export async function meGenerate(shipmentIds: string[]): Promise<GenerateResponse> {
  return call<GenerateResponse>("/me/shipment/generate", {
    method: "POST",
    body: JSON.stringify({ orders: shipmentIds }),
  });
}

type PrintResponse = { url?: string } | Record<string, { url?: string }>;

export async function mePrintUrl(
  shipmentIds: string[],
  mode: "private" | "public" = "private",
): Promise<string | null> {
  const json = (await call<PrintResponse>("/me/shipment/print", {
    method: "POST",
    body: JSON.stringify({ orders: shipmentIds, mode }),
  })) as PrintResponse;
  if (json && typeof json === "object" && "url" in json && typeof json.url === "string") {
    return json.url;
  }
  // Keyed-by-id variant
  for (const v of Object.values(json)) {
    if (v && typeof v === "object" && "url" in v && typeof v.url === "string") return v.url;
  }
  return null;
}

type TrackingResponse = Record<
  string,
  { tracking?: string; melhorenvio_tracking?: string; status?: string }
>;

export async function meTracking(shipmentIds: string[]): Promise<TrackingResponse> {
  return call<TrackingResponse>("/me/shipment/tracking", {
    method: "POST",
    body: JSON.stringify({ orders: shipmentIds }),
  });
}

// Build a stable sandbox/prod-agnostic tracking URL. ME doesn't always
// return one — and when they do, it's occasionally their internal page
// rather than the carrier's. This is a safe fallback.
export function meDefaultTrackingUrl(code: string): string {
  return `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`;
}

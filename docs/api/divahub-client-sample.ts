// Sample outbound client for the DivaHub side to call the Brilho de Diva
// storefront's inbound API.
//
// HOW TO USE in DivaHub:
//   1. Copy this file into ~/divahub/lib/integration/storefront/client.ts
//   2. Add to ~/divahub/.env.local:
//        BRILHODEDIVA_API_URL=https://loja.brilhodediva.com.br
//        BRILHODEDIVA_API_KEY=<the inbound key shared by storefront ops>
//   3. From DivaHub's existing publish pipeline (after a job is approved),
//      call publishProductToStorefront(payload).
//
// Wire format and error semantics are documented in
// docs/api/divahub-integration.md (in the storefront repo).

const BASE = (process.env.BRILHODEDIVA_API_URL ?? "").replace(/\/$/, "");
const KEY = process.env.BRILHODEDIVA_API_KEY ?? "";

export type StorefrontVariant = {
  sku: string;
  name?: string | null;
  priceCents: number;
  stock?: number;
  weightG?: number | null;
  attributes?: Record<string, string | number | boolean> | null;
};

export type StorefrontImage = {
  url: string;
  alt?: string | null;
  position?: number;
};

/**
 * Approved video reference for the storefront catalog. Proposed contract
 * extension — see docs/api/divahub-integration.md §4.2 "videos" for the
 * canonical spec DivaHub sends. Sent opportunistically: the storefront's
 * Zod schema ignores unknown fields today, so we can emit before the
 * ecom team ships handling.
 */
export type StorefrontVideo = {
  /** External public URL — prefer YouTube (embed-friendly). */
  url:    string;
  /** "youtube" | "tiktok" | "instagram" | "oci" */
  source: "youtube" | "tiktok" | "instagram" | "oci";
  /** "reel" | "story" */
  kind:   "reel" | "story";
};

export type StorefrontProductPayload = {
  externalId?: string;
  slug: string;
  name: string;
  description: string;
  active?: boolean;
  category?: { slug: string; name: string };
  variants: StorefrontVariant[];
  images?: StorefrontImage[];
  /** 0..4 approved video references. Storefront-side contract extension pending. */
  videos?: StorefrontVideo[];

  /** Compact label (≤80 chars) used on cards, breadcrumbs, share widgets. */
  shortName?:      string;
  /** Title tag for search engines (≤70 chars recommended). Falls back to `name` on storefront side. */
  seoTitle?:       string;
  /** Meta description (≤155 chars recommended). Falls back to `description` truncated. */
  seoDescription?: string;
  /** Search keywords — drives storefront-side `<meta name="keywords">` and search index weighting. */
  seoKeywords?:    string[];
};

export type StorefrontUpsertResult = {
  productId: string;
  slug: string;
  created: boolean;
  variantsCreated: number;
  variantsUpdated: number;
  variantsDormant: number;
  imagesReplaced: number;
};

export class StorefrontError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "StorefrontError";
  }
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  if (!BASE || !KEY) {
    throw new StorefrontError("BRILHODEDIVA_API_URL or BRILHODEDIVA_API_KEY not set", 0, null);
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  if (!res.ok) {
    throw new StorefrontError(
      `Storefront ${method} ${path} → ${res.status}`,
      res.status,
      parsed ?? text,
    );
  }
  return parsed as T;
}

/** Push or update a single product. Returns once the storefront has persisted. */
export async function publishProductToStorefront(
  payload: StorefrontProductPayload,
): Promise<StorefrontUpsertResult> {
  const json = await call<{ ok: true; result: StorefrontUpsertResult }>(
    "POST",
    "/api/integrations/divahub/products",
    payload,
  );
  return json.result;
}

/** Push up to 100 products in one transaction-per-product batch. */
export async function publishProductBatchToStorefront(
  payloads: StorefrontProductPayload[],
): Promise<StorefrontUpsertResult[]> {
  const json = await call<{ ok: true; results: StorefrontUpsertResult[] }>(
    "POST",
    "/api/integrations/divahub/products",
    { products: payloads },
  );
  return json.results;
}

/** Soft-deactivate a product. Returns true if it was active before this call. */
export async function deactivateStorefrontProduct(slug: string): Promise<boolean> {
  try {
    const json = await call<{ ok: true; deactivated: boolean }>(
      "DELETE",
      `/api/integrations/divahub/products/${encodeURIComponent(slug)}`,
    );
    return json.deactivated;
  } catch (err) {
    if (err instanceof StorefrontError && err.status === 404) return false;
    throw err;
  }
}

/** Connectivity + auth check. Throws on failure. */
export async function pingStorefront(): Promise<{ serverTime: string; keyHint: string }> {
  return call("GET", "/api/integrations/divahub/health");
}

// ---------- Retry helper (optional) ----------
//
// Storefront publishes are idempotent on slug, so it's safe to retry on any
// 5xx or 429. Skip retry on 4xx (except 429) — those mean payload is wrong.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retriable =
        err instanceof StorefrontError && (err.status >= 500 || err.status === 429);
      if (!retriable || i === max - 1) throw err;
      const delay = base * 2 ** i + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

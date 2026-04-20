// Low-level Tiny ERP HTTP client (Tiny API v2).
//
// Tiny v2 expects application/x-www-form-urlencoded POSTs to its
// `*.php` endpoints with `token`, `formato=JSON` and a JSON-encoded payload.
// We never log the token.
//
// Config is resolved per call via `loadTinyConfig()` — reads encrypted
// `tiny.apiToken` secret + plain `tiny.baseUrl` from SettingsKv.
// Configure everything via /admin/configuracoes → ERP (Tiny).

import { getSecret } from "@/lib/settings/config";
import { getSetting } from "@/lib/settings";

export type TinyConfig = {
  token: string;
  baseUrl: string;
};

export async function loadTinyConfig(): Promise<TinyConfig> {
  const [token, baseSetting] = await Promise.all([
    getSecret("tiny.apiToken"),
    getSetting("tiny.baseUrl"),
  ]);
  return {
    token: token ?? "",
    baseUrl: baseSetting.url || "https://api.tiny.com.br/api2",
  };
}

export type TinyEnvelope<T> = {
  retorno: {
    status: "OK" | "Erro";
    codigo_erro?: string;
    erros?: Array<{ erro: string }>;
    registros?: T;
  };
};

export class TinyError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "TinyError";
  }
}

async function call<T>(
  endpoint: string,
  payload: Record<string, string>,
  opts: { allowEmpty?: boolean } = {},
): Promise<T> {
  const cfg = await loadTinyConfig();
  if (!cfg.token) throw new TinyError("Tiny API token not configured");
  const body = new URLSearchParams({
    token: cfg.token,
    formato: "JSON",
    ...payload,
  });
  const res = await fetch(`${cfg.baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new TinyError(`Tiny HTTP ${res.status} on ${endpoint}`);
  }
  const json = (await res.json()) as TinyEnvelope<T>;
  if (json.retorno.status !== "OK") {
    const msg =
      json.retorno.erros?.map((e) => e.erro).join("; ") ?? "Tiny returned non-OK";
    throw new TinyError(msg, json.retorno.codigo_erro);
  }
  if (!json.retorno.registros) {
    if (opts.allowEmpty) return undefined as unknown as T;
    throw new TinyError("Tiny response missing 'registros'");
  }
  return json.retorno.registros;
}

export type TinyPedidoIncluirResponse = {
  registro: {
    id: number | string;
    numero?: string;
  };
};

export async function tinyPedidoIncluir(pedido: object): Promise<TinyPedidoIncluirResponse> {
  return call<TinyPedidoIncluirResponse>("pedido.incluir.php", {
    pedido: JSON.stringify({ pedido }),
  });
}

export type TinyProdutoSearchResponse = {
  produto: Array<{ id: string; codigo: string; nome: string }>;
};

// Tiny's `produtos.pesquisa.php` envelope has drifted significantly from
// older documented shapes. Observed in production (2026-04):
//   `{retorno: {status: "OK", produtos: [{produto: {id, codigo, nome}}]}}`
// but older accounts / other endpoints use:
//   `{retorno: {status: "OK", registros: {produto: [{id, codigo, nome}]}}}`
//
// We can't go through the generic `call<T>` helper because it requires
// `registros` — which doesn't exist on the current shape, and we'd either
// throw or return undefined silently. We fetch raw and parse defensively.
//
// This is the bug that had the storefront stuck at 0 stock for every SKU:
// the search returned null, the reconciler treated it as "missing from
// Tiny" (authoritative = zero), StockSyncEvent rows were never written.
export async function tinyBuscarProdutoPorSku(sku: string): Promise<TinyProdutoSearchResponse | null> {
  const cfg = await loadTinyConfig();
  if (!cfg.token) throw new TinyError("Tiny API token not configured");
  const body = new URLSearchParams({
    token: cfg.token,
    formato: "JSON",
    pesquisa: sku,
  });
  const res = await fetch(`${cfg.baseUrl}/produtos.pesquisa.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new TinyError(`Tiny HTTP ${res.status} on produtos.pesquisa.php`);

  const json = (await res.json()) as {
    retorno?: {
      status?: string;
      erros?: Array<{ erro?: string }>;
      codigo_erro?: string;
      registros?: {
        produto?: Array<{ id: string; codigo: string; nome: string }>;
        produtos?: Array<{ produto?: { id: string; codigo: string; nome: string } }>;
      };
      produto?: Array<{ id: string; codigo: string; nome: string }>;
      produtos?: Array<{ produto?: { id: string; codigo: string; nome: string } }>;
    };
  };
  const retorno = json.retorno ?? {};

  if (retorno.status && retorno.status !== "OK") {
    const msg =
      retorno.erros?.map((e) => e.erro ?? "").join("; ") || "Tiny returned non-OK";
    if (/n[aã]o.*(encontrad|retornou)/i.test(msg)) return null;
    throw new TinyError(msg, retorno.codigo_erro);
  }

  // Flatten whichever shape we got. Legacy registros variants take
  // precedence but we fall back to top-level keys for the current API.
  const legacy = retorno.registros?.produto;
  const wrappedLegacy = retorno.registros?.produtos;
  const topFlat = retorno.produto;
  const topWrapped = retorno.produtos;

  if (Array.isArray(legacy) && legacy.length) return { produto: legacy };
  if (Array.isArray(wrappedLegacy) && wrappedLegacy.length) {
    return {
      produto: wrappedLegacy
        .map((r) => r.produto)
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    };
  }
  if (Array.isArray(topFlat) && topFlat.length) return { produto: topFlat };
  if (Array.isArray(topWrapped) && topWrapped.length) {
    return {
      produto: topWrapped
        .map((r) => r.produto)
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    };
  }
  return null;
}

// Exponential backoff retry wrapper. Only retries on network / Tiny 5xx —
// NOT on TinyError codes like "produto não encontrado" which must propagate.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; baseMs?: number } = {},
): Promise<T> {
  const tries = opts.tries ?? 3;
  const baseMs = opts.baseMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRetriable =
        err instanceof TinyError && /HTTP 5\d\d/.test(err.message);
      const isNetwork =
        err instanceof Error && !(err instanceof TinyError);
      if (!isRetriable && !isNetwork) throw err;
      if (i === tries - 1) break;
      await new Promise((r) => setTimeout(r, baseMs * Math.pow(3, i)));
    }
  }
  throw lastErr;
}

type TinyEstoqueProduto = {
  id?: string | number;
  codigo?: string;
  saldo?: string | number;
  saldoReservado?: string | number;
  saldo_reservado?: string | number;
};

// Returns the current Tiny stock count for a SKU, or `null` if Tiny has no
// product with that SKU. Throws TinyError on transport / auth errors — the
// caller MUST distinguish these: a thrown error means "Tiny is unavailable,
// do not mark this SKU as missing." A null return means "Tiny says this
// SKU doesn't exist, treat as stock=0 on the storefront."
//
// We fetch raw (not via the generic `call<T>` helper) because the current
// Tiny v2 puts the `produto` object directly under `retorno`, not under
// `retorno.registros`. Bypassing the helper lets us tolerate both shapes.
export async function tinyGetStockBySku(sku: string): Promise<number | null> {
  const search = await withRetry(() => tinyBuscarProdutoPorSku(sku));
  if (!search || !search.produto.length) return null;

  // Prefer an exact `codigo` match — pesquisa.php is substring-based and can
  // return neighbors with longer SKUs.
  const exact = search.produto.find((p) => p.codigo === sku) ?? search.produto[0];
  if (!exact) return null;

  const estoque = await withRetry(() => fetchEstoqueById(String(exact.id)));
  if (!estoque) return 0;

  const raw = estoque.saldo ?? 0;
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

async function fetchEstoqueById(id: string): Promise<TinyEstoqueProduto | null> {
  const cfg = await loadTinyConfig();
  if (!cfg.token) throw new TinyError("Tiny API token not configured");
  const body = new URLSearchParams({ token: cfg.token, formato: "JSON", id });
  const res = await fetch(`${cfg.baseUrl}/produto.obter.estoque.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new TinyError(`Tiny HTTP ${res.status} on produto.obter.estoque.php`);

  const json = (await res.json()) as {
    retorno?: {
      status?: string;
      erros?: Array<{ erro?: string }>;
      codigo_erro?: string;
      produto?: TinyEstoqueProduto;
      registros?: { produto?: TinyEstoqueProduto };
    };
  };
  const retorno = json.retorno ?? {};
  if (retorno.status && retorno.status !== "OK") {
    const msg =
      retorno.erros?.map((e) => e.erro ?? "").join("; ") || "Tiny returned non-OK";
    if (/n[aã]o.*(encontrad|retornou)/i.test(msg)) return null;
    throw new TinyError(msg, retorno.codigo_erro);
  }
  return retorno.produto ?? retorno.registros?.produto ?? null;
}

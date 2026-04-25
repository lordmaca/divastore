// Divinha — outbound client against DivaHub's public API.
// Contract: ./DIVINHA_API_CONTRACT.md (v1). Keep this file in sync with §3–§11.
//
// Exposes:
//   health()                    GET  /api/public/divinha/health
//   turnStream(req)             POST /api/public/divinha/turn  (Accept: text/event-stream)
//   turnJson(req)               POST /api/public/divinha/turn  (Accept: application/json)
//   reportContractViolations()  POST /api/public/divinha/contract-violations
//
// Runtime: Node only (relies on Web fetch + ReadableStream — fine on Node ≥18,
// we're on 20). The BFF route at /api/chat/turn is the only caller; the
// browser never hits DivaHub directly.

import { getSecret } from "@/lib/settings/config";
import { getSetting } from "@/lib/settings";
import { assertAllowedUrl, DIVAHUB_ALLOW } from "@/lib/integration/ssrf";

// ---------- Config ----------

// The stored admin setting may legitimately include a trailing slash or the
// stale `/api` suffix — normalise so callers always get the origin.
function normaliseBaseUrl(u: string): string {
  return u.replace(/\/+$/, "").replace(/\/api$/, "");
}

type Config = { url: string; key: string };

export async function loadDivinhaConfig(): Promise<Config> {
  const [key, outbound] = await Promise.all([
    getSecret("divahub.apiKey"),
    getSetting("divahub.outbound"),
  ]);
  return {
    url: normaliseBaseUrl(outbound.url?.trim() ?? ""),
    key: (key ?? "").trim(),
  };
}

export function isDivinhaConfigured(cfg: Config): cfg is Config {
  return Boolean(cfg.url && cfg.key);
}

// ---------- Contract types (mirror §6, §7 of the contract) ----------

export type ProductRef = {
  slug: string;
  variantSku?: string;
  reason?: string;
};

export type CartItemRef = { variantId: string; qty: number };

export type AssistantMessage =
  | { id: string; role: "assistant"; kind: "text"; content: string }
  | { id: string; role: "assistant"; kind: "product_carousel"; products: ProductRef[] }
  | { id: string; role: "assistant"; kind: "quick_replies"; prompts: string[] }
  | { id: string; role: "assistant"; kind: "cart_preview"; items: CartItemRef[] }
  | { id: string; role: "assistant"; kind: "link"; label: string; href: string };

export type ChatAction =
  | { type: "add_to_cart"; variantSku: string; qty: number; reason?: string }
  | { type: "remove_from_cart"; variantId: string }
  | { type: "update_cart_qty"; variantId: string; qty: number }
  | { type: "apply_coupon"; code: string }
  | { type: "remove_coupon" }
  | { type: "show_product"; slug: string }
  | { type: "navigate"; path: string }
  | { type: "start_checkout" }
  | { type: "handoff_human"; reason: string }
  | { type: "request_customer_info"; fields: Array<"cep" | "email" | "nome"> };

export type TurnRequest = {
  conversationId: string | null;
  channel: "storefront_web";
  locale: "pt-BR";
  user: {
    customerId: string | null;
    sessionKey: string;
    email: string | null;
    firstName: string | null;
    isAuthenticated: boolean;
  };
  message: {
    id: string;
    role: "user";
    content: string;
    attachments: [];
  };
  cartSnapshot: {
    items: Array<{
      variantId: string;
      sku: string;
      name: string;
      qty: number;
      priceCents: number;
    }>;
    subtotalCents: number;
    couponCode: string | null;
    currency: "BRL";
  };
  context: {
    referrerPath: string | null;
    viewedProductSlug: string | null;
    utmSource: string | null;
    deviceHint: "mobile" | "desktop" | "tablet";
  };
  history: Array<{ role: "assistant" | "user"; content: string }>;
};

export type TurnEvent =
  | { event: "turn.start"; data: { turnId: string; conversationId: string } }
  | { event: "token"; data: { delta: string } }
  | { event: "message"; data: AssistantMessage }
  | { event: "action"; data: ChatAction }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } }
  | {
      event: "turn.end";
      data: { turnId: string; totalTokens?: number; stopReason: string };
    };

export type TurnJsonResponse = {
  turnId: string;
  conversationId: string;
  messages: AssistantMessage[];
  actions: ChatAction[];
  stopReason: string;
};

export type ContractViolation = {
  code: string;
  action: ChatAction | { type: string; [k: string]: unknown };
};

// ---------- Errors ----------

export class DivinhaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "DivinhaError";
  }
}

export class DivinhaNotConfiguredError extends DivinhaError {
  constructor() {
    super("Divinha outbound not configured (url + key)", 503, "not_configured", false);
    this.name = "DivinhaNotConfiguredError";
  }
}

// ---------- Health ----------

export async function health(): Promise<{
  ok: boolean;
  detail?: string;
  version?: string;
  llmOk?: boolean;
  checkedAt: Date;
}> {
  const cfg = await loadDivinhaConfig();
  if (!cfg.url) {
    return { ok: false, detail: "DivaHub outbound URL não configurada", checkedAt: new Date() };
  }
  const healthUrl = `${cfg.url}/api/public/divinha/health`;
  try {
    assertAllowedUrl(healthUrl, DIVAHUB_ALLOW);
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      checkedAt: new Date(),
    };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(healthUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      version?: string;
      llmOk?: boolean;
    } | null;
    return {
      ok: Boolean(body?.ok),
      version: body?.version,
      llmOk: body?.llmOk,
      detail: body?.ok ? undefined : `Divinha /health retornou ${res.status}`,
      checkedAt: new Date(),
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      checkedAt: new Date(),
    };
  }
}

// ---------- Turn (streaming) ----------

type TurnOpts = {
  requestId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

function requiredHeaders(cfg: Config, opts: TurnOpts | undefined, accept: string): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: accept,
    Authorization: `Bearer ${cfg.key}`,
    "X-Brilho-Request-Id": opts?.requestId ?? crypto.randomUUID(),
    "X-Brilho-Version": "1",
  };
  if (opts?.idempotencyKey) h["Idempotency-Key"] = opts.idempotencyKey;
  return h;
}

async function throwFromResponse(res: Response): Promise<never> {
  const raw = await res.text().catch(() => "");
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* body wasn't JSON */
  }
  const code =
    (parsed as { error?: string } | null)?.error ??
    (res.status === 401
      ? "unauthorized"
      : res.status === 429
        ? "rate_limited"
        : res.status === 503
          ? "llm_unavailable"
          : `http_${res.status}`);
  const retryable = res.status === 429 || res.status === 503 || res.status >= 500;
  throw new DivinhaError(
    `Divinha ${res.status} ${code}`,
    res.status,
    code,
    retryable,
    parsed ?? raw.slice(0, 500),
  );
}

// Minimal SSE parser. Handles comments (heartbeats), multi-line data, and
// out-of-order fields per the EventSource spec.
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<TurnEvent> {
  const decoder = new TextDecoder("utf-8");
  const reader = body.getReader();
  let buffer = "";
  let eventName = "";
  let dataBuf = "";

  const flush = (): TurnEvent | null => {
    if (!eventName || !dataBuf) {
      eventName = "";
      dataBuf = "";
      return null;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(dataBuf);
    } catch {
      eventName = "";
      dataBuf = "";
      return null;
    }
    const out = { event: eventName, data: parsed } as TurnEvent;
    eventName = "";
    dataBuf = "";
    return out;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line === "") {
          const ev = flush();
          if (ev) yield ev;
        } else if (line.startsWith(":")) {
          // comment / heartbeat — ignore
        } else if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const chunk = line.slice(5).replace(/^ /, "");
          dataBuf = dataBuf ? `${dataBuf}\n${chunk}` : chunk;
        }
        // other fields (id:, retry:) are ignored by the contract
      }
    }
    // flush trailing event if stream ended without a blank line
    const tail = flush();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export async function* turnStream(
  req: TurnRequest,
  opts?: TurnOpts,
): AsyncGenerator<TurnEvent> {
  const cfg = await loadDivinhaConfig();
  if (!isDivinhaConfigured(cfg)) throw new DivinhaNotConfiguredError();

  const url = `${cfg.url}/api/public/divinha/turn`;
  assertAllowedUrl(url, DIVAHUB_ALLOW);
  const res = await fetch(url, {
    method: "POST",
    headers: requiredHeaders(cfg, opts, "text/event-stream"),
    body: JSON.stringify(req),
    signal: opts?.signal,
  });

  if (!res.ok || !res.body) {
    await throwFromResponse(res);
  }

  yield* parseSSE(res.body!);
}

// ---------- Turn (JSON) ----------

export async function turnJson(
  req: TurnRequest,
  opts?: TurnOpts,
): Promise<TurnJsonResponse> {
  const cfg = await loadDivinhaConfig();
  if (!isDivinhaConfigured(cfg)) throw new DivinhaNotConfiguredError();

  const url = `${cfg.url}/api/public/divinha/turn`;
  assertAllowedUrl(url, DIVAHUB_ALLOW);
  const res = await fetch(url, {
    method: "POST",
    headers: requiredHeaders(cfg, opts, "application/json"),
    body: JSON.stringify(req),
    signal: opts?.signal,
  });
  if (!res.ok) await throwFromResponse(res);

  const parsed = (await res.json()) as TurnJsonResponse;
  if (!parsed.turnId || !parsed.conversationId) {
    throw new DivinhaError("Divinha response missing turnId/conversationId", 502, "bad_response", false, parsed);
  }
  return parsed;
}

// ---------- Contract violations (reverse channel) ----------

// Fire-and-forget — never block the user's turn on reporting. On failure we
// just swallow; the storefront already dropped the action so the user isn't
// stuck, and DivaHub's inbox can still be checked directly.
export async function reportContractViolations(payload: {
  turnId: string;
  conversationId: string;
  violations: ContractViolation[];
}): Promise<void> {
  if (payload.violations.length === 0) return;
  const cfg = await loadDivinhaConfig();
  if (!isDivinhaConfigured(cfg)) return;

  try {
    const url = `${cfg.url}/api/public/divinha/contract-violations`;
    assertAllowedUrl(url, DIVAHUB_ALLOW);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.key}`,
        "X-Brilho-Version": "1",
      },
      body: JSON.stringify({ ...payload, reportedAt: new Date().toISOString() }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // swallow — non-critical
  }
}

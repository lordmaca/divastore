// Simple in-memory token bucket. Adequate for single-instance PM2 deployment.
// For multi-instance later: swap with Redis (e.g. @upstash/ratelimit).

type Bucket = { tokens: number; refilledAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  capacity: number;
  refillPerSecond: number;
};

export function rateLimit(key: string, cfg: RateLimitConfig) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: cfg.capacity, refilledAt: now };
  const elapsedSec = (now - b.refilledAt) / 1000;
  const refilled = Math.min(cfg.capacity, b.tokens + elapsedSec * cfg.refillPerSecond);
  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, refilledAt: now });
    return { ok: false as const, retryAfterMs: Math.ceil(((1 - refilled) / cfg.refillPerSecond) * 1000) };
  }
  buckets.set(key, { tokens: refilled - 1, refilledAt: now });
  return { ok: true as const, remaining: Math.floor(refilled - 1) };
}

// Trust X-Real-IP first: nginx sets it from $remote_addr (the actual TCP peer),
// so it is not client-controllable. We fall back to the LAST entry of
// X-Forwarded-For — that's the value our nginx appended; entries earlier in the
// list could have been forged by the client.
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

// Redirect-safe check for a post-auth `next` parameter. Guards against
// protocol-relative (`//evil.com`) and backslash-escape (`/\evil.com`) payloads
// that browsers resolve off-site.
export function safeNext(next: string | undefined | null, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/\\")) return fallback;
  return next;
}

// Guard the prune interval against HMR re-evaluation in dev.
const PRUNE_KEY = "__bdRateLimitPrune";
const g = globalThis as typeof globalThis & { [PRUNE_KEY]?: NodeJS.Timeout };
if (!g[PRUNE_KEY]) {
  g[PRUNE_KEY] = setInterval(
    () => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [k, v] of buckets) if (v.refilledAt < cutoff) buckets.delete(k);
    },
    10 * 60 * 1000,
  );
  g[PRUNE_KEY].unref?.();
}

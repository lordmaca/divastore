import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { applyDeepLinkAdds } from "@/lib/cart/deep-link";
import { SITE_URL } from "@/lib/config";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deep-link processor for DivaHub DM cart links. The storefront page at
// /carrinho redirects here whenever the URL contains `?add=` — doing the
// cart writes + cookie set in a Route Handler avoids Next 16's "cookies
// may only be modified in a Server Action or Route Handler" rule.
//
// Flow: GET /api/cart/deep-link?add=<slug>&add=<slug>&cartRef=<uuid>&utm_*
//   1. Call applyDeepLinkAdds — upserts into the session cart.
//   2. Persist cartRef + utmSource in `dh_cart_ref` cookie (30d).
//   3. Redirect to /carrinho?toast=<code>&cartRef=<uuid>&utm_* (no `add`).

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const CART_REF_COOKIE = "dh_cart_ref";
const CART_REF_MAX_AGE = 60 * 60 * 24 * 30;

// Per-IP rate limit. The previous version had none, so a link preview bot
// or a misconfigured prefetcher could hammer this endpoint and silently
// fill victims' anonymous carts. 30 req/min / IP is plenty for any
// legitimate humans-clicking-links traffic.
const RATE = { capacity: 10, refillPerSecond: 0.5 };

export async function GET(req: NextRequest) {
  const rl = rateLimit(`deep-link:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const q = req.nextUrl.searchParams;
  const adds = q.getAll("add");
  const cartRef = q.get("cartRef") ?? undefined;
  const utmSource = q.get("utm_source") ?? "divahub_dm";

  let outcome = { addedCount: 0, addedQty: 0, missing: [] as string[] };
  if (adds.length > 0) {
    outcome = await applyDeepLinkAdds(adds);
  }

  if (cartRef && /^[a-zA-Z0-9-]{6,80}$/.test(cartRef)) {
    const jar = await cookies();
    jar.set(
      CART_REF_COOKIE,
      JSON.stringify({ cartRef, utmSource }),
      {
        path: "/",
        sameSite: "lax",
        secure: true,
        httpOnly: true,
        maxAge: CART_REF_MAX_AGE,
      },
    );
  }

  const out = new URLSearchParams();
  if (cartRef) out.set("cartRef", cartRef);
  for (const key of UTM_KEYS) {
    const v = q.get(key);
    if (v) out.set(key, v);
  }
  const toast =
    adds.length === 0
      ? null
      : outcome.addedCount === 0
        ? "dm-cart-empty"
        : outcome.missing.length > 0
          ? "dm-cart-partial"
          : "dm-cart-added";
  if (toast) out.set("toast", toast);

  // Propagate human-readable labels for missing items (e.g. "Tamanho 17")
  // so the toast can be specific instead of generic. Trim to avoid blowing
  // the URL length budget when the customer asked for many things.
  if (outcome.missing.length > 0) {
    out.set("missing", outcome.missing.slice(0, 4).join("|").slice(0, 200));
  }

  // Pin the redirect target to SITE_URL. Trusting X-Forwarded-Host here
  // was an open-redirect vector: nginx forwards `Host` from the client,
  // so an attacker who could make a direct request to the origin (or find
  // a misconfigured upstream) with `Host: evil.com` got a 303 to
  // `https://evil.com/carrinho` plus the `dh_cart_ref` cookie set on our
  // domain. The cookie set already happened above — bounding the redirect
  // to our own origin limits the damage to an already-logged action.
  const qs = out.toString();
  return NextResponse.redirect(
    new URL(qs ? `/carrinho?${qs}` : "/carrinho", SITE_URL),
    { status: 303 },
  );
}

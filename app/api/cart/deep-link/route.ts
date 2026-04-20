import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { applyDeepLinkAdds } from "@/lib/cart/deep-link";
import { SITE_URL } from "@/lib/config";

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

export async function GET(req: NextRequest) {
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

  // Resolve the public origin so nginx doesn't end up serving a redirect
  // to localhost:3001 (req.url is the internal URL Next sees). Prefer the
  // X-Forwarded-Host trio, then fall back to the configured SITE_URL.
  const xfHost = req.headers.get("x-forwarded-host");
  const xfProto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = xfHost ? `${xfProto}://${xfHost}` : SITE_URL;

  const qs = out.toString();
  return NextResponse.redirect(
    new URL(qs ? `/carrinho?${qs}` : "/carrinho", origin),
    { status: 303 },
  );
}

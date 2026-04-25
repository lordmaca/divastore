import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureTrackSession } from "@/lib/track";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { FunnelEventType } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, same-origin only. Beacon writes a single PageView and optionally a
// FunnelEvent. We rate-limit per IP to keep the pipe clean against floods.
const RATE = { capacity: 60, refillPerSecond: 5 };

// Public-beacon funnel allowlist. `ORDER_CREATED` / `ORDER_PAID` imply a
// DB-backed commitment and are ONLY emitted server-side (checkout action
// + MP webhook). Allowing them on this public endpoint let any client POST
// fake "paid order" rows and inflate the admin reporting dashboards.
const PUBLIC_FUNNEL_EVENTS = [
  FunnelEventType.VIEW_PDP,
  FunnelEventType.ADD_TO_CART,
  FunnelEventType.BEGIN_CHECKOUT,
] as const;
const PublicFunnelEnum = z.enum(
  PUBLIC_FUNNEL_EVENTS as unknown as [string, ...string[]],
);

const beaconSchema = z.object({
  path: z.string().min(1).max(500),
  productId: z.string().min(1).max(64).nullish(),
  referer: z.string().max(1024).nullish(),
  device: z.enum(["mobile", "desktop", "tablet"]).nullish(),
  utmSource: z.string().max(120).nullish(),
  utmMedium: z.string().max(120).nullish(),
  utmCampaign: z.string().max(120).nullish(),
  // Restricted to front-of-funnel only; ORDER_* events rejected.
  funnel: PublicFunnelEnum.nullish(),
});

export async function POST(req: NextRequest) {
  // Same-origin guard: reject requests with an Origin header that isn't ours.
  // sendBeacon doesn't send Origin in some browsers; missing Origin is allowed.
  const origin = req.headers.get("origin");
  const expected = (process.env.AUTH_URL ?? "https://loja.brilhodediva.com.br").replace(/\/$/, "");
  if (origin && origin !== expected) {
    return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }

  // DNT: 1 → silently accept and noop. This mirrors how a privacy-respecting
  // analytics stack should behave; UI keeps working, no row is written.
  const dnt = req.headers.get("dnt") === "1";
  if (dnt) return NextResponse.json({ ok: true, dnt: true });

  const rl = rateLimit(`track:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = beaconSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 422 });
    }
    throw err;
  }

  const [{ sessionId }, session] = await Promise.all([ensureTrackSession(), auth()]);
  const customerId = session?.user?.id ?? null;

  // Resolve productId from the slug if the path is a PDP and no explicit hint
  // was sent. Falls back to null.
  let productId = parsed.productId ?? null;
  if (!productId) {
    const m = parsed.path.match(/^\/loja\/([a-z0-9-]+)$/);
    if (m) {
      const p = await prisma.product.findUnique({ where: { slug: m[1] }, select: { id: true } });
      productId = p?.id ?? null;
    }
  }

  await prisma.pageView.create({
    data: {
      path: parsed.path,
      productId,
      sessionId,
      customerId,
      referer: parsed.referer ?? null,
      device: parsed.device ?? null,
      utmSource: parsed.utmSource ?? null,
      utmMedium: parsed.utmMedium ?? null,
      utmCampaign: parsed.utmCampaign ?? null,
    },
  });

  if (parsed.funnel) {
    // Safe cast — PublicFunnelEnum is a subset of FunnelEventType by
    // construction (its values come directly from the FunnelEventType
    // enum). The Zod schema produces a string because of how z.enum
    // narrows, but the runtime value is guaranteed to be one of the
    // allowlist entries.
    await prisma.funnelEvent.create({
      data: {
        type: parsed.funnel as FunnelEventType,
        sessionId,
        customerId,
        productId,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

import { cookies, headers } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import type { FunnelEventType } from "@/lib/generated/prisma/enums";

// Server-side analytics helpers. Tracking is opt-out-friendly:
// - Anonymous opaque session cookie (24 h), distinct from cart cookie.
// - Honors `DNT: 1` request header (server-side guard mirrors the beacon).
// - Admin/account paths never tracked (caller decides).

const SESSION_COOKIE = "bd_track";
const SESSION_TTL = 60 * 60 * 24;

export async function readTrackSession(): Promise<{ sessionId: string | null; doNotTrack: boolean }> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const sessionId = jar.get(SESSION_COOKIE)?.value ?? null;
  const dnt = h.get("dnt") === "1" || h.get("DNT") === "1";
  return { sessionId, doNotTrack: dnt };
}

export async function ensureTrackSession(): Promise<{ sessionId: string; doNotTrack: boolean }> {
  const jar = await cookies();
  const h = await headers();
  const dnt = h.get("dnt") === "1" || h.get("DNT") === "1";
  let sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    sessionId = randomBytes(16).toString("hex");
    jar.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL,
      path: "/",
    });
  }
  return { sessionId, doNotTrack: dnt };
}

// Fire-and-forget funnel event from a server context (server actions, webhooks,
// route handlers). Caller MUST be okay with this writing to the DB. Failures
// are logged but never rethrown — analytics must never break user flows.
export async function trackServerEvent(input: {
  type: FunnelEventType;
  productId?: string | null;
  orderId?: string | null;
  customerIdOverride?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const [{ sessionId, doNotTrack }, session] = await Promise.all([
      readTrackSession(),
      auth(),
    ]);
    if (doNotTrack) return;
    const customerId = input.customerIdOverride ?? session?.user?.id ?? null;
    if (!sessionId && !customerId) return;
    await prisma.funnelEvent.create({
      data: {
        type: input.type,
        sessionId: sessionId ?? `customer:${customerId}`,
        customerId,
        productId: input.productId ?? null,
        orderId: input.orderId ?? null,
        metadata: input.metadata as never,
      },
    });
  } catch (err) {
    console.error("trackServerEvent failed", err);
  }
}

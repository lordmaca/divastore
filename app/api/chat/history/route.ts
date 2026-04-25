import { NextResponse, type NextRequest } from "next/server";
import { getSetting } from "@/lib/settings";
import { ensureChatSession } from "@/lib/chat/session";
import { getRecentThread } from "@/lib/chat/conversation";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight reopen endpoint. Returns the most recent OPEN thread for the
// caller, from the local mirror (DivaHub remains source of truth — see
// DIVINHA_API_CONTRACT.md §9). Used by the widget to rehydrate on mount.
//
// Rate-limited per session so a hostile client (or a stuck polling bug)
// can't hammer the DB reading conversation history.
const RATE = { capacity: 30, refillPerSecond: 1 };

export async function GET(_req: NextRequest) {
  const flag = await getSetting("divinha.enabled");
  if (!flag.enabled) {
    return NextResponse.json({ enabled: false, conversation: null });
  }

  const session = await ensureChatSession();
  const rl = rateLimit(`chat:history:${session.sessionKey}`, RATE);
  if (!rl.ok) {
    return NextResponse.json(
      { enabled: true, conversation: null, rateLimited: true },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }
  const conversation = await getRecentThread(session, 30);
  return NextResponse.json({ enabled: true, conversation });
}

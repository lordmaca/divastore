import { NextResponse, type NextRequest } from "next/server";
import { getSetting } from "@/lib/settings";
import { ensureChatSession } from "@/lib/chat/session";
import { getRecentThread } from "@/lib/chat/conversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight reopen endpoint. Returns the most recent OPEN thread for the
// caller, from the local mirror (DivaHub remains source of truth — see
// DIVINHA_API_CONTRACT.md §9). Used by the widget to rehydrate on mount.

export async function GET(_req: NextRequest) {
  const flag = await getSetting("divinha.enabled");
  if (!flag.enabled) {
    return NextResponse.json({ enabled: false, conversation: null });
  }

  const session = await ensureChatSession();
  const conversation = await getRecentThread(session, 30);
  return NextResponse.json({ enabled: true, conversation });
}

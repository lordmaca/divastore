import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { ensureChatSession } from "@/lib/chat/session";
import { actionSchema, executeAction } from "@/lib/chat/actions";
import {
  reportContractViolations,
  type ChatAction,
} from "@/lib/integration/divahub/divinha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  turnId: z.string().min(1),
  conversationId: z.string().min(1),
  action: actionSchema,
});

// Budget: 60 actions/min/session (more bursty than turns — the UI may fire
// several add_to_cart in quick succession).
const RATE = { capacity: 20, refillPerSecond: 1 };

export async function POST(req: NextRequest) {
  const flag = await getSetting("divinha.enabled");
  if (!flag.enabled) {
    return NextResponse.json(
      { ok: false, error: { code: "divinha_disabled" } },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "validation_failed" } },
      { status: 422 },
    );
  }

  const session = await ensureChatSession();
  const rl = rateLimit(`chat:action:${session.sessionKey}`, RATE);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "rate_limited", retryAfterMs: rl.retryAfterMs } },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const action = parsed.action as ChatAction;
  const result = await executeAction(action);

  if (!result.ok) {
    // Fire-and-forget contract-violation report; DivaHub surfaces it in the
    // conversation's admin inbox so prompt/playbook regressions are visible.
    void reportContractViolations({
      turnId: parsed.turnId,
      conversationId: parsed.conversationId,
      violations: [result.violation],
    });
    await prisma.integrationRun
      .create({
        data: {
          adapter: "divahub_divinha",
          operation: "action.violation",
          status: "violation",
          error: result.violation.code,
          payload: { turnId: parsed.turnId, conversationId: parsed.conversationId, action } as never,
        },
      })
      .catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: { code: result.violation.code } },
      { status: 422 },
    );
  }

  return NextResponse.json({ ok: true, result: result.result ?? null });
}

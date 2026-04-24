import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSetting } from "@/lib/settings";
import { getCartReadOnly, cartTotals } from "@/lib/cart";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { ensureChatSession } from "@/lib/chat/session";
import {
  upsertConversation,
  persistUserMessage,
  persistAssistantTurn,
} from "@/lib/chat/conversation";
import {
  turnStream,
  DivinhaError,
  type AssistantMessage,
  type ChatAction,
  type TurnRequest,
  type TurnEvent,
} from "@/lib/integration/divahub/divinha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().nullable().optional(),
  message: z.object({
    content: z.string().min(1).max(4000),
  }),
  context: z
    .object({
      referrerPath: z.string().max(500).nullable().optional(),
      viewedProductSlug: z.string().max(200).nullable().optional(),
      utmSource: z.string().max(100).nullable().optional(),
      deviceHint: z.enum(["mobile", "desktop", "tablet"]).optional(),
    })
    .optional(),
});

// 40 turns/min/session, burst 10 — the storefront-side defense in depth.
// DivaHub enforces its own 120 turns/min/session on their side.
const RATE = { capacity: 10, refillPerSecond: 2 / 3 };

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  };
}

export async function POST(req: NextRequest) {
  // --- 1. Kill switch --------------------------------------------------
  const flag = await getSetting("divinha.enabled");
  if (!flag.enabled) {
    return NextResponse.json(
      { ok: false, error: { code: "divinha_disabled", message: "A Divinha está desativada no momento." } },
      { status: 503 },
    );
  }

  // --- 2. Parse body ---------------------------------------------------
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_failed", message: "Requisição inválida." } },
      { status: 422 },
    );
  }

  // --- 3. Session + rate limit ----------------------------------------
  const session = await ensureChatSession();
  const rl = rateLimit(`chat:turn:${session.sessionKey}`, RATE);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "rate_limited", retryAfterMs: rl.retryAfterMs } },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  // --- 4. Cart snapshot ------------------------------------------------
  const cart = await getCartReadOnly(session.customerId);
  const totals = cartTotals(cart);
  const cartSnapshot: TurnRequest["cartSnapshot"] = {
    items:
      cart?.items.map((it) => ({
        variantId: it.variantId,
        sku: it.variant.sku,
        name: it.variant.product.name,
        qty: it.qty,
        priceCents: it.variant.priceCents,
      })) ?? [],
    subtotalCents: totals.subtotalCents,
    couponCode: null,
    currency: "BRL",
  };

  // --- 5. Build TurnRequest -------------------------------------------
  const userMessageId = `msg_${crypto.randomUUID()}`;
  const turnReq: TurnRequest = {
    conversationId: parsed.conversationId ?? null,
    channel: "storefront_web",
    locale: "pt-BR",
    user: {
      customerId: session.customerId,
      sessionKey: session.sessionKey,
      email: session.email,
      firstName: session.firstName,
      isAuthenticated: session.isAuthenticated,
    },
    message: {
      id: userMessageId,
      role: "user",
      content: parsed.message.content,
      attachments: [],
    },
    cartSnapshot,
    context: {
      referrerPath: parsed.context?.referrerPath ?? null,
      viewedProductSlug: parsed.context?.viewedProductSlug ?? null,
      utmSource: parsed.context?.utmSource ?? null,
      deviceHint: parsed.context?.deviceHint ?? "desktop",
    },
    history: [],
  };

  // --- 6. Stream ------------------------------------------------------
  const encoder = new TextEncoder();
  const requestId = crypto.randomUUID();
  const start = Date.now();

  // Mutable collectors captured in the stream closure; flushed in finally.
  let localConversationId: string | null = null;
  let externalConversationId: string | null = null;
  let turnId: string | null = null;
  const assistantMessages: AssistantMessage[] = [];
  const actions: ChatAction[] = [];
  let stopReason = "unknown";
  let errorCode: string | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of turnStream(turnReq, { requestId })) {
          // --- side-effect bookkeeping ---
          if (ev.event === "turn.start") {
            externalConversationId = ev.data.conversationId;
            turnId = ev.data.turnId;
            const conv = await upsertConversation(externalConversationId, session);
            localConversationId = conv.id;
            await persistUserMessage({
              conversationId: conv.id,
              externalId: userMessageId,
              content: parsed.message.content,
            });
          } else if (ev.event === "message") {
            assistantMessages.push(ev.data);
          } else if (ev.event === "action") {
            actions.push(ev.data);
          } else if (ev.event === "error") {
            errorCode = ev.data.code;
          } else if (ev.event === "turn.end") {
            stopReason = ev.data.stopReason;
          }

          // --- forward to browser ---
          controller.enqueue(encoder.encode(sseFrame(ev.event, ev.data)));
        }
      } catch (err) {
        const payload =
          err instanceof DivinhaError
            ? { code: err.code, message: err.message, retryable: err.retryable }
            : {
                code: "stream_error",
                message: err instanceof Error ? err.message : String(err),
                retryable: true,
              };
        errorCode = payload.code;
        controller.enqueue(encoder.encode(sseFrame("error", payload)));
        controller.enqueue(
          encoder.encode(sseFrame("turn.end", { turnId, stopReason: "error" })),
        );
      } finally {
        // Best-effort persistence — the user already saw the stream; a DB
        // failure here must not crash the route.
        try {
          if (localConversationId && turnId) {
            await persistAssistantTurn({
              conversationId: localConversationId,
              turnId,
              messages: assistantMessages,
              actions,
            });
          }
          await prisma.integrationRun.create({
            data: {
              adapter: "divahub_divinha",
              operation: "turn",
              status: errorCode ? "error" : "ok",
              durationMs: Date.now() - start,
              error: errorCode,
              payload: {
                requestId,
                turnId,
                conversationId: externalConversationId,
                messageCount: assistantMessages.length,
                actionCount: actions.length,
                stopReason,
              } as never,
            },
          });
        } catch {
          /* swallow — already committed user-facing stream */
        }
        controller.close();
      }
    },
    cancel() {
      // Browser navigated away — nothing to do; collectors have already been
      // persisted in the finally block above if the iterator completed.
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

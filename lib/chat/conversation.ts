import { prisma } from "@/lib/db";
import { ChatMessageRole } from "@/lib/generated/prisma/enums";
import type { AssistantMessage, ChatAction } from "@/lib/integration/divahub/divinha";
import type { ChatSession } from "./session";

// Storefront-local mirror of Divinha threads. DivaHub remains the source of
// truth for the full log — see DIVINHA_API_CONTRACT.md §9 — but we persist a
// copy so the widget can render history on reopen without a round-trip.

// Upsert a conversation by DivaHub-minted externalId. First-turn ids are
// learned from the turn.start event, so this is called lazily.
export async function upsertConversation(
  externalId: string,
  session: ChatSession,
) {
  return prisma.chatConversation.upsert({
    where: { externalId },
    create: {
      externalId,
      customerId: session.customerId,
      sessionKey: session.sessionKey,
    },
    update: {
      lastMessageAt: new Date(),
      // Upgrade ownership when an anonymous thread is later resumed while
      // logged in — only if not already claimed by the same customer.
      customerId: session.customerId ?? undefined,
    },
  });
}

export async function persistUserMessage(args: {
  conversationId: string;
  externalId: string;
  content: string;
}) {
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: args.conversationId,
        externalId: args.externalId,
        role: ChatMessageRole.USER,
        kind: "text",
        content: args.content,
      },
    }),
    prisma.chatConversation.update({
      where: { id: args.conversationId },
      data: {
        lastMessageAt: new Date(),
        messageCount: { increment: 1 },
      },
    }),
  ]);
}

export async function persistAssistantTurn(args: {
  conversationId: string;
  turnId: string;
  messages: AssistantMessage[];
  actions: ChatAction[];
  tokensOut?: number;
}) {
  if (args.messages.length === 0 && args.actions.length === 0) return;
  type Row = {
    conversationId: string;
    externalId: string | null;
    role: typeof ChatMessageRole.ASSISTANT;
    kind: string;
    content: string | null;
    payload: object | null;
    turnId: string;
    actions?: unknown;
    tokensOut?: number;
  };

  const rows: Row[] = args.messages.map((m) => {
    // Text messages carry plain content; structured kinds move the body to payload.
    const content = m.kind === "text" ? m.content : null;
    const payload = m.kind === "text" ? null : (m as object);
    return {
      conversationId: args.conversationId,
      externalId: m.id,
      role: ChatMessageRole.ASSISTANT,
      kind: m.kind,
      content,
      payload,
      turnId: args.turnId,
    };
  });

  // If Divinha emitted only actions without any message payload, still record
  // a marker row so the admin inbox shows the side-effect.
  if (rows.length === 0 && args.actions.length > 0) {
    rows.push({
      conversationId: args.conversationId,
      externalId: null,
      role: ChatMessageRole.ASSISTANT,
      kind: "action_only",
      content: null,
      payload: null,
      turnId: args.turnId,
    });
  }

  // Attach the actions array to the last assistant row so a single admin
  // inspection shows both the reply text and the emitted side-effects.
  if (rows.length > 0 && args.actions.length > 0) {
    rows[rows.length - 1].actions = args.actions;
  }
  if (args.tokensOut != null && rows.length > 0) {
    rows[rows.length - 1].tokensOut = args.tokensOut;
  }

  await prisma.$transaction([
    prisma.chatMessage.createMany({
      data: rows as never,
    }),
    prisma.chatConversation.update({
      where: { id: args.conversationId },
      data: {
        lastMessageAt: new Date(),
        messageCount: { increment: rows.length },
      },
    }),
  ]);
}

// Fetch recent messages for the widget's reopen view. DivaHub-side owns the
// long tail — local mirror caps at the last 30 messages per thread to keep
// the payload tiny.
export async function getRecentThread(session: ChatSession, limit = 30) {
  const where = session.customerId
    ? { customerId: session.customerId }
    : { sessionKey: session.sessionKey };
  const conversation = await prisma.chatConversation.findFirst({
    where: { ...where, status: "OPEN" as const },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      externalId: true,
      status: true,
      lastMessageAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: limit,
        select: {
          id: true,
          externalId: true,
          role: true,
          kind: true,
          content: true,
          payload: true,
          actions: true,
          createdAt: true,
        },
      },
    },
  });
  return conversation;
}

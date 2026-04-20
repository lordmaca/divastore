import { OrderEventType } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";

export type RecordOrderEventInput = {
  actor?: string;                                 // default "system"
  message?: string;                               // short pt-BR line
  metadata?: Record<string, unknown> | null;      // structured details
};

// Single entry point for writing OrderEvent rows. Use this everywhere a
// state transition happens so the timeline is always in sync with reality.
// Errors are swallowed: a failed event write must never bring down the
// primary flow (checkout, webhook, admin action). Misses show up as gaps
// in the timeline, not exceptions upstream.
//
// Server-only: importing this file from a client component throws at
// build time thanks to `server-only`.
export async function recordOrderEvent(
  orderId: string,
  type: OrderEventType,
  opts: RecordOrderEventInput = {},
): Promise<void> {
  try {
    await prisma.orderEvent.create({
      data: {
        orderId,
        type,
        actor: opts.actor ?? "system",
        message: opts.message ?? null,
        metadata:
          opts.metadata != null
            ? (JSON.parse(JSON.stringify(opts.metadata)) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("recordOrderEvent failed", { orderId, type, err });
  }
}

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { NotificationChannel, NotificationStatus } from "@/lib/generated/prisma/enums";
import { sendEmail, emailConfigured } from "./channels/email";
import { sendWhatsApp } from "./channels/whatsapp";
import { render, type TemplateData, type TemplateName } from "./templates";
import { NotConfiguredError, TransportError } from "./errors";
import { absoluteUrl } from "./templates/shared";

type EnqueueInput<K extends TemplateName> = {
  channel: NotificationChannel;
  template: K;
  data: TemplateData[K];
  recipient: string;               // email address or E.164 phone
  customerId?: string | null;
  orderId?: string | null;
  // Pre-rendered subject override (useful for admin reruns).
  subjectOverride?: string;
};

// Enqueue a notification row, then attempt to send it synchronously.
// Idempotency: Notification has @@unique([orderId, template, channel]). If
// the same (order, template, channel) is enqueued twice, the second call
// becomes a no-op returning the existing row.
export async function enqueueAndSend<K extends TemplateName>(
  input: EnqueueInput<K>,
): Promise<void> {
  const row = await enqueue(input);
  if (!row) return;
  await sendPending(row.id);
}

export async function enqueue<K extends TemplateName>(
  input: EnqueueInput<K>,
): Promise<{ id: string } | null> {
  const rendered = render(input.template, input.data);

  try {
    const row = await prisma.notification.create({
      data: {
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        channel: input.channel,
        template: input.template,
        recipient: input.recipient,
        subject: input.subjectOverride ?? rendered.subject,
        status: NotificationStatus.PENDING,
        payload: {
          data: input.data as Prisma.InputJsonValue,
          rendered: {
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            marketing: rendered.marketing,
          },
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row;
  } catch (err) {
    // P2002 on (orderId, template, channel) — already enqueued for this
    // order. Don't double-send. Return null so callers don't re-trigger.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}

export async function sendPending(id: string): Promise<void> {
  const row = await prisma.notification.findUnique({ where: { id } });
  if (!row) return;
  if (row.status === NotificationStatus.SENT) return;

  const payload = row.payload as {
    data: Record<string, unknown>;
    rendered: { subject: string; html: string; text: string; marketing: boolean };
  };

  // Marketing gating: re-check opt-in at send time (customer may have
  // opted out between enqueue and send).
  if (payload.rendered.marketing && row.customerId) {
    const c = await prisma.customer.findUnique({
      where: { id: row.customerId },
      select: { marketingOptIn: true, whatsappOptIn: true },
    });
    const allowed =
      row.channel === NotificationChannel.EMAIL ? c?.marketingOptIn : c?.whatsappOptIn;
    if (!allowed) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: NotificationStatus.SKIPPED, lastError: "marketing_opted_out" },
      });
      return;
    }
  }

  try {
    if (row.channel === NotificationChannel.EMAIL) {
      if (!(await emailConfigured())) {
        await prisma.notification.update({
          where: { id: row.id },
          data: {
            status: NotificationStatus.SKIPPED,
            lastError: "email_not_configured",
          },
        });
        return;
      }
      const unsubscribeUrl = row.customerId
        ? absoluteUrl(`/unsubscribe?cid=${encodeURIComponent(row.customerId)}`)
        : undefined;
      await sendEmail({
        to: row.recipient,
        subject: row.subject ?? payload.rendered.subject,
        html: payload.rendered.html,
        text: payload.rendered.text,
        includeUnsubscribe: payload.rendered.marketing,
        unsubscribeUrl,
      });
    } else if (row.channel === NotificationChannel.WHATSAPP) {
      await sendWhatsApp({
        to: row.recipient,
        template: row.template,
        data: payload.data,
        text: payload.rendered.text,
      });
    } else {
      throw new NotConfiguredError(row.channel);
    }

    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        attempts: row.attempts + 1,
        lastError: null,
      },
    });
  } catch (err) {
    const skip = err instanceof NotConfiguredError;
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: skip ? NotificationStatus.SKIPPED : NotificationStatus.FAILED,
        attempts: row.attempts + 1,
        lastError:
          err instanceof TransportError || err instanceof NotConfiguredError
            ? err.message
            : err instanceof Error
              ? err.message.slice(0, 500)
              : String(err).slice(0, 500),
      },
    });
    if (!skip) throw err;
  }
}

// Fire-and-forget helper for use inside request handlers / server actions.
// Swallows errors so a mail outage never takes down checkout.
export async function sendSafe<K extends TemplateName>(
  input: EnqueueInput<K>,
): Promise<void> {
  try {
    await enqueueAndSend(input);
  } catch (err) {
    console.error(
      `notification(${input.channel}/${input.template}) dispatch failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// Retry sweeper — picks up FAILED rows under the attempt cap.
// Call from scripts/retry-notifications.ts (PM2 cron).
const BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]; // 5m, 30m, 2h

export async function sweepFailed(limit = 50): Promise<{ tried: number; sent: number }> {
  const candidates = await prisma.notification.findMany({
    where: { status: NotificationStatus.FAILED, attempts: { lt: BACKOFF_MS.length } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let sent = 0;
  const now = Date.now();
  for (const c of candidates) {
    const nextAllowed = new Date(c.updatedAt).getTime() + (BACKOFF_MS[c.attempts - 1] ?? 0);
    if (now < nextAllowed) continue;
    try {
      await sendPending(c.id);
      sent++;
    } catch {
      /* already recorded on the row */
    }
  }
  return { tried: candidates.length, sent };
}

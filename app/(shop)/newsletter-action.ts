"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Newsletter signup — opts a customer into marketing, creates a guest
// Customer row if the email is new, and returns the active coupon code
// (configured in /admin/configuracoes → Home → Newsletter) as proof of
// success. The caller uses the returned couponCode to render the thank-you
// state with the coupon. Transactional emails still flow regardless; only
// marketing gates on the opt-in flag.

const schema = z.object({
  email: z.string().email().max(254),
  couponCode: z.string().max(80),
});

export type NewsletterResult =
  | { ok: true; couponCode: string; alreadySubscribed: boolean }
  | { ok: false; error: string };

export async function subscribeNewsletterAction(
  rawEmail: string,
  couponCode: string,
): Promise<NewsletterResult> {
  const ip = getClientIp(await headers());
  // 3 attempts per IP per hour. Guards against scraping-style abuse without
  // hurting a real customer who mistyped.
  const rl = rateLimit(`newsletter:${ip}`, { capacity: 3, refillPerSecond: 3 / 3600 });
  if (!rl.ok) {
    return { ok: false, error: "Muitas tentativas. Tente novamente em instantes." };
  }

  const parsed = schema.safeParse({
    email: rawEmail.toLowerCase().trim(),
    couponCode: couponCode.trim().toUpperCase(),
  });
  if (!parsed.success) return { ok: false, error: "E-mail inválido" };

  const { email } = parsed.data;
  const now = new Date();
  const existing = await prisma.customer.findUnique({
    where: { email },
    select: { id: true, marketingOptIn: true },
  });

  let alreadySubscribed = false;
  if (existing) {
    if (existing.marketingOptIn) {
      alreadySubscribed = true;
    } else {
      await prisma.customer.update({
        where: { id: existing.id },
        data: { marketingOptIn: true, marketingOptInAt: now },
      });
    }
  } else {
    await prisma.customer.create({
      data: {
        email,
        guest: true,
        marketingOptIn: true,
        marketingOptInAt: now,
      },
    });
  }

  return { ok: true, couponCode: parsed.data.couponCode, alreadySubscribed };
}

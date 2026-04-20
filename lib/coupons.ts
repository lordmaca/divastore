import { prisma } from "@/lib/db";
import { CouponType } from "@/lib/generated/prisma/enums";

export type CouponEvaluation =
  | { ok: true; code: string; discountCents: number; reason?: undefined }
  | { ok: false; reason: string };

// Validate a coupon against a current subtotal and compute the discount.
// Discount is capped at the subtotal (we never owe the customer money).
export async function evaluateCoupon(
  rawCode: string,
  subtotalCents: number,
): Promise<CouponEvaluation> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "Informe um cupom." };

  const c = await prisma.coupon.findUnique({ where: { code } });
  if (!c || !c.active) return { ok: false, reason: "Cupom inválido." };
  if (c.expiresAt && c.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "Cupom expirado." };
  }
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) {
    return { ok: false, reason: "Cupom esgotado." };
  }
  if (subtotalCents < c.minSubtotalCents) {
    return {
      ok: false,
      reason: `Pedido mínimo de R$ ${(c.minSubtotalCents / 100).toFixed(2)} para esse cupom.`,
    };
  }

  const raw =
    c.type === CouponType.PERCENT
      ? Math.round((subtotalCents * c.value) / 100)
      : c.value;
  const discountCents = Math.max(0, Math.min(raw, subtotalCents));
  return { ok: true, code: c.code, discountCents };
}

export async function incrementCouponUsage(code: string) {
  await prisma.coupon.update({
    where: { code },
    data: { usedCount: { increment: 1 } },
  });
}

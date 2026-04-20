"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { CouponType } from "@/lib/generated/prisma/enums";

const createSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.nativeEnum(CouponType),
  value: z.number().int().min(1).max(100_00000),
  minSubtotalCents: z.number().int().min(0).default(0),
  expiresAt: z.string().datetime().optional().or(z.literal("").transform(() => undefined)),
  usageLimit: z.number().int().min(1).optional(),
});

export async function createCoupon(input: z.infer<typeof createSchema>) {
  await requireAdmin();
  const data = createSchema.parse(input);
  await prisma.coupon.create({
    data: {
      code: data.code.trim().toUpperCase(),
      type: data.type,
      value: data.value,
      minSubtotalCents: data.minSubtotalCents,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      usageLimit: data.usageLimit ?? null,
    },
  });
  revalidatePath("/admin/cupons");
}

export async function toggleCoupon(id: string) {
  await requireAdmin();
  const c = await prisma.coupon.findUnique({ where: { id } });
  if (!c) return;
  await prisma.coupon.update({ where: { id }, data: { active: !c.active } });
  revalidatePath("/admin/cupons");
}

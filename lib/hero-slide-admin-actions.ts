"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { HeroSlideSource } from "@/lib/generated/prisma/enums";

// Admin-only CRUD for HeroSlide. DivaHub upserts via the public inbound
// endpoint (`/api/integrations/divahub/home/hero-slide`) — this file is for
// manual slides + admin overrides on auto-pushed slides.

const overrideSchema = z.object({
  headlineOverride: z.string().max(200).optional().nullable(),
  subOverride: z.string().max(300).optional().nullable(),
  ctaLabelOverride: z.string().max(60).optional().nullable(),
  ctaUrlOverride: z.string().max(300).optional().nullable(),
  enabled: z.boolean().optional(),
  weight: z.number().int().min(1).max(10).optional(),
});

export type OverrideResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateHeroSlideOverridesAction(
  id: string,
  input: z.infer<typeof overrideSchema>,
): Promise<OverrideResult> {
  await requireAdmin();
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  // Empty string = clear the override (fall back to DivaHub's base value).
  const clean = {
    headlineOverride: parsed.data.headlineOverride?.trim() || null,
    subOverride: parsed.data.subOverride?.trim() || null,
    ctaLabelOverride: parsed.data.ctaLabelOverride?.trim() || null,
    ctaUrlOverride: parsed.data.ctaUrlOverride?.trim() || null,
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
    ...(parsed.data.weight !== undefined ? { weight: parsed.data.weight } : {}),
  };
  await prisma.heroSlide.update({ where: { id }, data: clean });
  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteHeroSlideAction(id: string): Promise<OverrideResult> {
  await requireAdmin();
  await prisma.heroSlide.delete({ where: { id } });
  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  return { ok: true };
}

const createSchema = z.object({
  imageUrl: z.string().url().max(500),
  imageAlt: z.string().max(300).optional().nullable(),
  headline: z.string().min(1).max(200),
  sub: z.string().max(300).optional().nullable(),
  ctaLabel: z.string().min(1).max(60),
  ctaUrl: z.string().min(1).max(300),
  productId: z.string().max(60).optional().nullable(),
  activeFrom: z.string().optional().nullable(),
  activeUntil: z.string().optional().nullable(),
});

export async function createManualHeroSlideAction(
  input: z.infer<typeof createSchema>,
): Promise<OverrideResult & { id?: string }> {
  await requireAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const d = parsed.data;
  const slide = await prisma.heroSlide.create({
    data: {
      source: HeroSlideSource.MANUAL,
      imageUrl: d.imageUrl,
      imageAlt: d.imageAlt?.trim() || null,
      headline: d.headline.trim(),
      sub: d.sub?.trim() || null,
      ctaLabel: d.ctaLabel.trim(),
      ctaUrl: d.ctaUrl.trim(),
      productId: d.productId?.trim() || null,
      activeFrom: d.activeFrom ? new Date(d.activeFrom) : null,
      activeUntil: d.activeUntil ? new Date(d.activeUntil) : null,
      enabled: true,
      weight: 1,
    },
    select: { id: true },
  });
  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  return { ok: true, id: slide.id };
}

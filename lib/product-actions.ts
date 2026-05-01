"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { productInput } from "@/lib/product-schema";
import { ProductSource } from "@/lib/generated/prisma/enums";
import { revalidateCatalogPublicSurfaces } from "@/lib/seo/cache";

// Narrow the shared schema to the admin form: admin can change slug only on
// create (immutable on edit because the slug is part of canonical URLs).
const createSchema = productInput;
const updateSchema = productInput.extend({
  id: z.string().min(1),
});

function variantWriteData(v: z.infer<typeof productInput>["variants"][number]) {
  return {
    sku: v.sku,
    name: v.name ?? null,
    priceCents: v.priceCents,
    stock: v.stock,
    weightG: v.weightG ?? null,
    attributes: v.attributes ?? undefined,
  };
}

async function upsertCategory(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  cat: { slug: string; name: string } | undefined,
): Promise<string | undefined> {
  if (!cat) return undefined;
  const row = await tx.category.upsert({
    where: { slug: cat.slug },
    create: cat,
    update: { name: cat.name },
  });
  return row.id;
}

export async function createProduct(input: z.infer<typeof createSchema>) {
  await requireAdmin();
  const data = createSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const categoryId = await upsertCategory(tx, data.category);
    const product = await tx.product.create({
      data: {
        slug: data.slug,
        name: data.name,
        shortName: data.shortName ?? null,
        description: data.description,
        active: data.active,
        source: ProductSource.MANUAL,
        categoryId,
        seoTitle: data.seoTitle ?? null,
        seoDescription: data.seoDescription ?? null,
        seoKeywords: data.seoKeywords ?? [],
        variants: { create: data.variants.map(variantWriteData) },
        images: {
          create: data.images.map((i, idx) => ({
            url: i.url,
            alt: i.alt ?? null,
            position: i.position ?? idx,
          })),
        },
        videos: {
          create: (data.videos ?? []).map((v, idx) => ({
            url: v.url,
            source: v.source.toUpperCase() as "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "OCI",
            kind: v.kind.toUpperCase() as "REEL" | "STORY",
            position: idx,
          })),
        },
      },
    });
    revalidatePath("/admin/produtos");
    revalidatePath("/loja");
    revalidateCatalogPublicSurfaces();
    return { id: product.id, slug: product.slug };
  });
}

export async function updateProduct(input: z.infer<typeof updateSchema>) {
  await requireAdmin();
  const data = updateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({
      where: { id: data.id },
      include: { variants: true },
    });
    if (!existing) throw new Error("Produto não encontrado.");

    const categoryId = (await upsertCategory(tx, data.category)) ?? existing.categoryId;

    await tx.product.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        shortName: data.shortName ?? null,
        description: data.description,
        active: data.active,
        categoryId,
        seoTitle: data.seoTitle ?? null,
        seoDescription: data.seoDescription ?? null,
        seoKeywords: data.seoKeywords ?? [],
      },
    });

    // Variants: same dormant-on-missing strategy as the DivaHub upsert.
    const incomingSkus = new Set(data.variants.map((v) => v.sku));
    const existingBySku = new Map(existing.variants.map((v) => [v.sku, v]));
    for (const v of data.variants) {
      const prior = existingBySku.get(v.sku);
      if (prior) {
        await tx.variant.update({ where: { id: prior.id }, data: variantWriteData(v) });
      } else {
        await tx.variant.create({
          data: { ...variantWriteData(v), productId: existing.id },
        });
      }
    }
    const dormant = existing.variants.filter((v) => !incomingSkus.has(v.sku) && v.stock !== 0);
    if (dormant.length) {
      await tx.variant.updateMany({
        where: { id: { in: dormant.map((v) => v.id) } },
        data: { stock: 0 },
      });
    }

    await tx.image.deleteMany({ where: { productId: existing.id } });
    if (data.images.length) {
      await tx.image.createMany({
        data: data.images.map((i, idx) => ({
          productId: existing.id,
          url: i.url,
          alt: i.alt ?? null,
          position: i.position ?? idx,
        })),
      });
    }

    await tx.productVideo.deleteMany({ where: { productId: existing.id } });
    const incomingVideos = data.videos ?? [];
    if (incomingVideos.length) {
      await tx.productVideo.createMany({
        data: incomingVideos.map((v, idx) => ({
          productId: existing.id,
          url: v.url,
          source: v.source.toUpperCase() as "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "OCI",
          kind: v.kind.toUpperCase() as "REEL" | "STORY",
          position: idx,
        })),
      });
    }

    revalidatePath("/admin/produtos");
    revalidatePath(`/admin/produtos/${existing.id}`);
    revalidatePath(`/loja/${existing.slug}`);
    revalidatePath("/loja");
    revalidateCatalogPublicSurfaces();
    return { id: existing.id, slug: existing.slug };
  });
}

export type BulkProductAction = "activate" | "deactivate" | "delete";

export async function bulkProductAction(
  ids: string[],
  action: BulkProductAction,
): Promise<{ ok: true; affected: number; skipped: { id: string; slug: string; reason: string }[] }> {
  await requireAdmin();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: true, affected: 0, skipped: [] };
  }
  const unique = Array.from(new Set(ids.filter((s) => typeof s === "string" && s.length > 0)));
  if (unique.length === 0) return { ok: true, affected: 0, skipped: [] };

  if (action === "activate" || action === "deactivate") {
    const res = await prisma.product.updateMany({
      where: { id: { in: unique } },
      data: { active: action === "activate" },
    });
    revalidatePath("/admin/produtos");
    revalidatePath("/loja");
    revalidateCatalogPublicSurfaces();
    return { ok: true, affected: res.count, skipped: [] };
  }

  // delete: OrderItem and CartItem both reference Variant with onDelete
  // RESTRICT, so the cascade `Product → Variant` would fail if anything
  // points at a variant. We MUST preserve order history (skip those
  // products), but cart items are ephemeral session scratch — it's safe
  // to wipe them so abandoned guest carts don't block admin intent.
  const targets = await prisma.product.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      slug: true,
      variants: {
        select: {
          id: true,
          _count: { select: { orderItems: true } },
        },
      },
    },
  });
  const skipped: { id: string; slug: string; reason: string }[] = [];
  const deletable: string[] = [];
  const variantIdsToClear: string[] = [];
  for (const p of targets) {
    const hasOrders = p.variants.some((v) => v._count.orderItems > 0);
    if (hasOrders) {
      skipped.push({ id: p.id, slug: p.slug, reason: "possui pedidos" });
    } else {
      deletable.push(p.id);
      for (const v of p.variants) variantIdsToClear.push(v.id);
    }
  }
  let affected = 0;
  if (deletable.length) {
    // Clear abandoned cart refs in the same transaction as the product
    // delete — either both happen or neither, so a mid-flight failure
    // never leaves carts pointing at a deleted variant.
    await prisma.$transaction(async (tx) => {
      if (variantIdsToClear.length) {
        await tx.cartItem.deleteMany({
          where: { variantId: { in: variantIdsToClear } },
        });
      }
      const res = await tx.product.deleteMany({
        where: { id: { in: deletable } },
      });
      affected = res.count;
    });
  }
  revalidatePath("/admin/produtos");
  revalidatePath("/loja");
  revalidatePath("/carrinho");
  revalidateCatalogPublicSurfaces();
  return { ok: true, affected, skipped };
}

export async function setProductActive(id: string, active: boolean) {
  await requireAdmin();
  const p = await prisma.product.update({
    where: { id },
    data: { active },
    select: { slug: true },
  });
  revalidatePath("/admin/produtos");
  revalidatePath(`/loja/${p.slug}`);
  revalidatePath("/loja");
  revalidateCatalogPublicSurfaces();
  return { ok: true };
}

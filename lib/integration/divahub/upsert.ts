import { prisma } from "@/lib/db";
import type { ProductInput } from "./inbound-schema";
import { ProductSource } from "@/lib/generated/prisma/enums";
import { mirrorImageIfExternal } from "./image-mirror";
import { scanProduct } from "@/lib/catalog/scan";
import { revalidateCatalogPublicSurfaces } from "@/lib/seo/cache";

export type UpsertResult = {
  productId: string;
  slug: string;
  created: boolean;
  variantsCreated: number;
  variantsUpdated: number;
  variantsDormant: number;
  imagesReplaced: number;
};

// Thrown when DivaHub tries to upsert a slug that admin already created
// manually. Surfacing this as 409 keeps the admin's edits authoritative.
export class ManualProductCollisionError extends Error {
  constructor(slug: string) {
    super(`Product '${slug}' is admin-managed (source=MANUAL); refusing DivaHub overwrite.`);
    this.name = "ManualProductCollisionError";
  }
}

// Upsert a single product from DivaHub.
//
// Images go through mirrorImageIfExternal() so DivaHub's pre-signed URLs are
// replaced with permanent URLs in our public bucket. That step runs OUTSIDE
// the transaction (HTTP fetches) to keep the tx short.
export async function upsertProductFromDivahub(input: ProductInput): Promise<UpsertResult> {
  // Transaction 1: product + variants + strip old images.
  const { product, created, variantsCreated, variantsUpdated, variantsDormant } =
    await prisma.$transaction(async (tx) => {
      let categoryId: string | undefined;
      if (input.category) {
        const cat = await tx.category.upsert({
          where: { slug: input.category.slug },
          create: { slug: input.category.slug, name: input.category.name },
          update: { name: input.category.name },
        });
        categoryId = cat.id;
      }

      const existing = await tx.product.findUnique({
        where: { slug: input.slug },
        include: { variants: true },
      });

      if (existing && existing.source === ProductSource.MANUAL) {
        throw new ManualProductCollisionError(input.slug);
      }

      const seoData = {
        shortName: input.shortName ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        seoKeywords: input.seoKeywords ?? [],
      };

      const product = existing
        ? await tx.product.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              description: input.description,
              active: input.active,
              categoryId: categoryId ?? existing.categoryId,
              source: ProductSource.DIVAHUB,
              externalId: input.externalId ?? existing.externalId,
              ...seoData,
            },
          })
        : await tx.product.create({
            data: {
              slug: input.slug,
              name: input.name,
              description: input.description,
              active: input.active,
              categoryId,
              source: ProductSource.DIVAHUB,
              externalId: input.externalId,
              ...seoData,
            },
          });

      const incomingSkus = new Set(input.variants.map((v) => v.sku));
      const existingBySku = new Map((existing?.variants ?? []).map((v) => [v.sku, v]));
      let variantsCreated = 0;
      let variantsUpdated = 0;

      for (const v of input.variants) {
        const prior = existingBySku.get(v.sku);
        if (prior) {
          await tx.variant.update({
            where: { id: prior.id },
            data: {
              name: v.name ?? null,
              priceCents: v.priceCents,
              stock: v.stock,
              weightG: v.weightG ?? null,
              attributes: v.attributes ?? undefined,
            },
          });
          variantsUpdated++;
        } else {
          await tx.variant.create({
            data: {
              productId: product.id,
              sku: v.sku,
              name: v.name ?? null,
              priceCents: v.priceCents,
              stock: v.stock,
              weightG: v.weightG ?? null,
              attributes: v.attributes ?? undefined,
            },
          });
          variantsCreated++;
        }
      }

      const dormantIds = (existing?.variants ?? [])
        .filter((v) => !incomingSkus.has(v.sku) && v.stock !== 0)
        .map((v) => v.id);
      if (dormantIds.length) {
        await tx.variant.updateMany({
          where: { id: { in: dormantIds } },
          data: { stock: 0 },
        });
      }

      await tx.image.deleteMany({ where: { productId: product.id } });
      await tx.productVideo.deleteMany({ where: { productId: product.id } });

      return {
        product,
        created: !existing,
        variantsCreated,
        variantsUpdated,
        variantsDormant: dormantIds.length,
      };
    });

  // Phase 2 (outside tx): mirror image URLs, then bulk insert. HTTP fetches
  // don't belong inside the tx. Partial failures fall back to the original URL
  // via mirrorImageIfExternal.
  if (input.images.length > 0) {
    const mirrored = await Promise.all(
      input.images.map(async (i, idx) => ({
        productId: product.id,
        url: await mirrorImageIfExternal(i.url, product.slug, idx),
        alt: i.alt ?? null,
        position: i.position ?? idx,
      })),
    );
    await prisma.image.createMany({ data: mirrored });
  }

  // Videos: array order = priority per DivaHub contract. We don't mirror video
  // URLs (DivaHub guarantees public YouTube/TikTok/Instagram; OCI is skipped
  // unless explicitly opted in later).
  if (input.videos.length > 0) {
    await prisma.productVideo.createMany({
      data: input.videos.map((v, idx) => ({
        productId: product.id,
        url: v.url,
        source: v.source.toUpperCase() as "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "OCI",
        kind: v.kind.toUpperCase() as "REEL" | "STORY",
        position: idx,
      })),
    });
  }

  // Category hygiene: DivaHub imports sometimes land products in the wrong
  // bucket (Beleza by default). The scanner checks the name and either
  // auto-applies (high confidence) or opens an issue for admin review.
  // Fire-and-forget — a classifier failure should never block a product
  // that otherwise upserted fine.
  try {
    await scanProduct(product.id);
  } catch (err) {
    console.error("[divahub-upsert] category scan failed", { productId: product.id, err });
  }

  // Bust the public-surface ISR caches so the GMC feed and sitemap reflect
  // this push within seconds instead of waiting up to an hour.
  revalidateCatalogPublicSurfaces();

  return {
    productId: product.id,
    slug: product.slug,
    created,
    variantsCreated,
    variantsUpdated,
    variantsDormant,
    imagesReplaced: input.images.length,
  };
}

export async function deactivateProductBySlug(slug: string): Promise<{ deactivated: boolean }> {
  const updated = await prisma.product.updateMany({
    where: { slug, active: true },
    data: { active: false },
  });
  if (updated.count > 0) revalidateCatalogPublicSurfaces();
  return { deactivated: updated.count > 0 };
}

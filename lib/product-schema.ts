import { z } from "zod";

// Shared product payload schema. Both the DivaHub inbound API
// (lib/integration/divahub/inbound-schema.ts) and the admin product CRUD UI
// (lib/product-actions.ts) consume this so the validation contract is identical.
//
// Money is integer cents (BRL). Slug is the storefront's stable identifier and
// is part of the canonical URL — keep it immutable across edits.

export const slugSchema = z
  .string()
  .min(2)
  .max(200)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase-kebab-case");

export const skuSchema = z.string().min(1).max(64);

export const variantInput = z.object({
  sku: skuSchema,
  name: z.string().max(120).nullish(),
  priceCents: z.number().int().min(0).max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  weightG: z.number().int().min(0).max(100_000).nullish(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullish(),
});

export const imageInput = z.object({
  url: z.string().url().max(1024),
  alt: z.string().max(255).nullish(),
  position: z.number().int().min(0).max(99).default(0),
});

// Videos: DivaHub sends up to 4, already in priority order. We preserve the
// order via `position` assigned server-side from the array index.
export const videoInput = z.object({
  url: z.string().url().max(1024),
  source: z.enum(["youtube", "tiktok", "instagram", "oci"]),
  kind: z.enum(["reel", "story"]),
});

export const categoryInput = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(80),
});

export const productInput = z.object({
  externalId: z.string().min(1).max(120).optional(),
  slug: slugSchema,
  name: z.string().min(2).max(200),
  description: z.string().max(8000),
  active: z.boolean().default(true),
  category: categoryInput.optional(),
  variants: z.array(variantInput).min(1).max(50),
  images: z.array(imageInput).max(20).default([]),
  videos: z.array(videoInput).max(4).default([]),

  // Optional SEO overrides from DivaHub. When present, used verbatim in PDP
  // metadata (keeps our storefront consistent with DivaHub's curated titles).
  // When absent, we derive from name/description.
  seoTitle: z.string().max(70).optional(),       // Google typically truncates ≥60 chars
  seoDescription: z.string().max(200).optional(), // Google truncates ≥155 chars
  seoKeywords: z.array(z.string().max(60)).max(20).optional(),
  shortName: z.string().min(2).max(80).optional(), // clean display name for cards/breadcrumbs
});

export const productBatchInput = z.object({
  products: z.array(productInput).min(1).max(100),
});

export type ProductInput = z.infer<typeof productInput>;
export type ProductBatchInput = z.infer<typeof productBatchInput>;
export type VariantInput = z.infer<typeof variantInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type VideoInput = z.infer<typeof videoInput>;

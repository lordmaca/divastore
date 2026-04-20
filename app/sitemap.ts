import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL as BASE } from "@/lib/config";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: {
        slug: true,
        updatedAt: true,
        images: { orderBy: { position: "asc" }, take: 3, select: { url: true } },
      },
    }),
    prisma.category.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  const now = new Date();

  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/loja`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...categories.map((c) => ({
      url: `${BASE}/loja?categoria=${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: `${BASE}/loja/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      // Google image sitemap: surfaces product photos in Google Images.
      images: p.images.map((i) => i.url),
    })),
  ];
}

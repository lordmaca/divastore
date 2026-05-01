import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL as BASE } from "@/lib/config";
import { getSetting } from "@/lib/settings";

// 5 min ISR — sitemap doesn't need to be as fresh as the GMC feed (price
// and stock changes don't affect URL inventory), but new product pushes
// SHOULD show up within minutes. Catalog mutations bust this cache via
// `revalidateCatalogPublicSurfaces()` so deletes and new products are
// near-instant; the 5 min is just the worst-case ceiling.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, hidden, about] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: {
        slug: true,
        updatedAt: true,
        images: { orderBy: { position: "asc" }, take: 3, select: { url: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // Drop empty categories from the sitemap — Google de-prioritizes URLs
    // that resolve to a near-empty list page.
    prisma.category.findMany({
      select: {
        slug: true,
        updatedAt: true,
        _count: { select: { products: { where: { active: true } } } },
      },
    }),
    getSetting("navigation.hiddenCategorySlugs"),
    getSetting("about.page"),
  ]);

  const hiddenSet = new Set(hidden.slugs ?? []);
  const visibleCategories = categories
    .filter((c) => !hiddenSet.has(c.slug))
    .filter((c) => c._count.products > 0);

  // Use the latest product updatedAt as the home/loja lastmod so we don't
  // spam Google with a fresh-every-fetch timestamp it ignores anyway.
  const latestProductMtime =
    products[0]?.updatedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${BASE}/`,
      lastModified: latestProductMtime,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE}/loja`,
      lastModified: latestProductMtime,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  if (about.enabled) {
    entries.push({
      url: `${BASE}/sobre`,
      lastModified: new Date(), // editable in admin; refresh per generation
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  // Static legal/policy page — not setting-gated, always included.
  entries.push({
    url: `${BASE}/trocas-e-devolucoes`,
    lastModified: new Date(),
    changeFrequency: "yearly",
    priority: 0.4,
  });

  for (const c of visibleCategories) {
    entries.push({
      url: `${BASE}/loja?categoria=${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const p of products) {
    entries.push({
      url: `${BASE}/loja/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
      // Google image sitemap: surfaces product photos in Google Images.
      images: p.images.map((i) => i.url),
    });
  }

  return entries;
}

import { cache } from "react";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export type NavCategory = {
  slug: string;
  name: string;
  href: string;       // pre-built `/loja?categoria=<slug>`
  productCount: number;
};

// Returns the categories that should appear in the public navigation.
// Active-products-only (empty categories are hidden), minus the
// admin-configured `navigation.hiddenCategorySlugs` blocklist. Sorted by
// product count descending, then name — busiest buckets first.
//
// Cached per-request via React.cache so the Header + Footer + any other
// caller on the same SSR pass only hit the DB once.
export const getNavCategories = cache(async (): Promise<NavCategory[]> => {
  const hidden = new Set<string>(
    (await getSetting("navigation.hiddenCategorySlugs")).slugs,
  );

  // Aggregate active-product count per category in a single query; drops
  // categories that have zero active products (empty nav tabs are noise).
  const rows = await prisma.category.findMany({
    where: {
      products: { some: { active: true } },
    },
    select: {
      slug: true,
      name: true,
      _count: { select: { products: { where: { active: true } } } },
    },
  });

  const filtered = rows.filter((r) => !hidden.has(r.slug));

  filtered.sort((a, b) => {
    const diff = b._count.products - a._count.products;
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return filtered.map((r) => ({
    slug: r.slug,
    name: r.name,
    href: `/loja?categoria=${r.slug}`,
    productCount: r._count.products,
  }));
});

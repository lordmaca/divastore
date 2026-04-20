import { prisma } from "@/lib/db";
import { ensureCartWritable } from "@/lib/cart";

// DivaHub DM deep-link handler — see docs/api/divahub-dm-cart-deeplink.md
// (or the brief in the PR). Resolves each `?add=<slug>` into a product +
// in-stock default variant, then upserts into the caller's cart (anonymous
// cookie-scoped OR logged-in customer-scoped — ensureCartWritable decides).
//
// Same slug repeated N times = quantity of N. Unknown/inactive/out-of-stock
// slugs are reported via `missing` so the caller can surface a toast.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

export type DeepLinkOutcome = {
  addedCount: number;   // total distinct slugs actually added
  addedQty: number;     // total quantity added across items
  missing: string[];    // slugs we refused (unknown / inactive / no stock)
};

export async function applyDeepLinkAdds(
  slugs: string[],
): Promise<DeepLinkOutcome> {
  // Aggregate repeats into quantities and sanity-check shape.
  const qtyBySlug = new Map<string, number>();
  for (const raw of slugs) {
    const s = raw.trim().toLowerCase();
    if (!SLUG_RE.test(s)) continue;
    qtyBySlug.set(s, (qtyBySlug.get(s) ?? 0) + 1);
  }
  if (qtyBySlug.size === 0) {
    return { addedCount: 0, addedQty: 0, missing: [] };
  }

  const products = await prisma.product.findMany({
    where: { slug: { in: [...qtyBySlug.keys()] }, active: true },
    select: {
      slug: true,
      variants: {
        orderBy: { priceCents: "asc" },
        select: { id: true, stock: true },
      },
    },
  });

  const cart = await ensureCartWritable();
  const missing: string[] = [];
  let addedCount = 0;
  let addedQty = 0;

  for (const [slug, requestedQty] of qtyBySlug) {
    const p = products.find((x) => x.slug === slug);
    if (!p) {
      missing.push(slug);
      continue;
    }
    // Default variant = cheapest with stock.
    const variant = p.variants.find((v) => v.stock > 0);
    if (!variant) {
      missing.push(slug);
      continue;
    }
    const qty = Math.min(Math.max(1, requestedQty), variant.stock, 99);

    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      create: { cartId: cart.id, variantId: variant.id, qty },
      update: { qty: { increment: qty } },
    });
    addedCount += 1;
    addedQty += qty;
  }

  return { addedCount, addedQty, missing };
}

import { prisma } from "@/lib/db";
import { ensureCartWritable } from "@/lib/cart";
import { parseVariantSku, looksLikeVariantSku } from "@/lib/cart/variant-sku";

// DivaHub DM deep-link handler — see docs/api/divahub-dm-cart-deeplink.md
// Resolves each `?add=<token>` into a cart line:
//   - Token matching `^DIVA-\d{6}-(T|M)<value>$` → variant SKU: add THAT
//     exact variant (checks Product.active + variant.stock).
//   - Any other token → slug: add the product's default (cheapest
//     in-stock) variant, preserving pre-variants behaviour.
//
// Repeats on the SAME token = quantity += 1. Different tokens referencing
// the same variant still merge (cartItem upsert by variantId).
// Unknown / inactive / out-of-stock tokens are reported via `missing`
// with a human-readable label so the toast can say "Tamanho 17
// indisponível" instead of a generic message.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

export type DeepLinkOutcome = {
  addedCount: number;      // total distinct tokens actually added
  addedQty: number;        // total quantity added across items
  missing: string[];       // human-readable labels for skipped tokens
};

export async function applyDeepLinkAdds(
  tokens: string[],
): Promise<DeepLinkOutcome> {
  // Aggregate repeats into quantities per canonical token (case-sensitive
  // for SKUs, lower-cased for slugs).
  const qtyByToken = new Map<string, { qty: number; isSku: boolean }>();
  for (const raw of tokens) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (looksLikeVariantSku(trimmed)) {
      const key = trimmed;
      const cur = qtyByToken.get(key);
      qtyByToken.set(key, { qty: (cur?.qty ?? 0) + 1, isSku: true });
      continue;
    }
    const slug = trimmed.toLowerCase();
    if (!SLUG_RE.test(slug)) continue;
    const cur = qtyByToken.get(slug);
    qtyByToken.set(slug, { qty: (cur?.qty ?? 0) + 1, isSku: false });
  }
  if (qtyByToken.size === 0) {
    return { addedCount: 0, addedQty: 0, missing: [] };
  }

  // Preload everything we may need in two queries.
  const slugKeys = [...qtyByToken.entries()].filter(([, v]) => !v.isSku).map(([k]) => k);
  const skuKeys = [...qtyByToken.entries()].filter(([, v]) => v.isSku).map(([k]) => k);

  const [productsBySlug, variantsBySku] = await Promise.all([
    slugKeys.length > 0
      ? prisma.product.findMany({
          where: { slug: { in: slugKeys }, active: true },
          select: {
            slug: true,
            variants: {
              orderBy: { priceCents: "asc" },
              select: { id: true, stock: true },
            },
          },
        })
      : Promise.resolve([]),
    skuKeys.length > 0
      ? prisma.variant.findMany({
          where: { sku: { in: skuKeys } },
          select: {
            id: true,
            sku: true,
            stock: true,
            product: { select: { active: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const cart = await ensureCartWritable();
  const missing: string[] = [];
  let addedCount = 0;
  let addedQty = 0;

  for (const [token, { qty: requestedQty, isSku }] of qtyByToken) {
    let variantId: string | null = null;
    let availableStock = 0;

    if (isSku) {
      const v = variantsBySku.find((x) => x.sku === token);
      if (!v || !v.product.active || v.stock <= 0) {
        const parsed = parseVariantSku(token);
        missing.push(parsed?.label ?? token);
        continue;
      }
      variantId = v.id;
      availableStock = v.stock;
    } else {
      const p = productsBySlug.find((x) => x.slug === token);
      if (!p) {
        missing.push(token);
        continue;
      }
      const defaultVariant = p.variants.find((v) => v.stock > 0);
      if (!defaultVariant) {
        missing.push(token);
        continue;
      }
      variantId = defaultVariant.id;
      availableStock = defaultVariant.stock;
    }

    const qty = Math.min(Math.max(1, requestedQty), availableStock, 99);
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, qty },
      update: { qty: { increment: qty } },
    });
    addedCount += 1;
    addedQty += qty;
  }

  return { addedCount, addedQty, missing };
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight product hydration for the chat UI. Divinha only emits slug/SKU
// per contract §6 — the browser hits this endpoint to render cards with
// live price, stock, and image.
//
// Resilient lookup: matches by slug first, falls back to variantSku. This
// guards against cross-system slug drift (e.g. slug-length caps diverging
// between DivaHub and the storefront). The response always carries the
// canonical storefront slug so the UI can link reliably.

const refSchema = z.object({
  slug: z.string().min(1).max(200),
  variantSku: z.string().min(1).max(64).optional(),
});

const bodySchema = z.object({
  refs: z.array(refSchema).min(1).max(12),
});

type Hydrated = {
  slug: string;
  name: string;
  fullName: string;
  image: string | null;
  imageAlt: string;
  priceCents: number | null;
  inStock: boolean;
  defaultVariantSku: string | null;
  variants: Array<{
    id: string;
    sku: string;
    name: string | null;
    priceCents: number;
    inStock: boolean;
  }>;
};

type Match = { ref: z.infer<typeof refSchema>; match: Hydrated | null };

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 422 });
  }

  const slugs = parsed.refs.map((r) => r.slug);
  const skus = parsed.refs.map((r) => r.variantSku).filter((s): s is string => Boolean(s));

  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { slug: { in: slugs } },
        ...(skus.length > 0 ? [{ variants: { some: { sku: { in: skus } } } }] : []),
      ],
    },
    select: {
      slug: true,
      name: true,
      shortName: true,
      images: { take: 1, orderBy: { position: "asc" }, select: { url: true, alt: true } },
      variants: {
        select: { id: true, sku: true, priceCents: true, stock: true, name: true },
        orderBy: { priceCents: "asc" },
      },
    },
  });

  function hydrate(p: (typeof products)[number]): Hydrated {
    const inStock = p.variants.filter((v) => v.stock > 0);
    const cheapest = inStock[0] ?? p.variants[0];
    return {
      slug: p.slug,
      name: p.shortName ?? p.name,
      fullName: p.name,
      image: p.images[0]?.url ?? null,
      imageAlt: p.images[0]?.alt ?? p.name,
      priceCents: cheapest?.priceCents ?? null,
      inStock: inStock.length > 0,
      defaultVariantSku: cheapest?.sku ?? null,
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        priceCents: v.priceCents,
        inStock: v.stock > 0,
      })),
    };
  }

  const matches: Match[] = parsed.refs.map((ref) => {
    const bySlug = products.find((p) => p.slug === ref.slug);
    if (bySlug) return { ref, match: hydrate(bySlug) };
    if (ref.variantSku) {
      const bySku = products.find((p) =>
        p.variants.some((v) => v.sku === ref.variantSku),
      );
      if (bySku) return { ref, match: hydrate(bySku) };
    }
    return { ref, match: null };
  });

  return NextResponse.json({ matches });
}

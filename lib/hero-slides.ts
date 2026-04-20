import { prisma } from "@/lib/db";

// Resolve the hero-slide queue for the storefront landing page. A slide is
// eligible when:
//   - enabled = true
//   - now is inside [activeFrom, activeUntil] (either bound may be null)
//   - if linked to a product: product.active AND at least one variant with
//     stock > 0. Slides without a product link bypass the stock gate.
//
// The caller gets back a shuffled + weight-aware subset of up to `take`
// slides. Override fields collapse into the effective text so the
// downstream renderer doesn't need to know about the override mechanism.

export type EffectiveSlide = {
  id: string;
  imageUrl: string;
  imageAlt?: string;
  headline: string;
  sub?: string;
  ctaLabel: string;
  ctaUrl: string;
};

export async function resolveHeroSlides(take = 5): Promise<EffectiveSlide[]> {
  const now = new Date();
  const candidates = await prisma.heroSlide.findMany({
    where: {
      enabled: true,
      OR: [{ activeFrom: null }, { activeFrom: { lte: now } }],
      AND: [
        { OR: [{ activeUntil: null }, { activeUntil: { gte: now } }] },
      ],
    },
    include: {
      product: {
        select: { active: true, variants: { select: { stock: true } } },
      },
    },
  });

  const eligible = candidates.filter((s) => {
    if (!s.productId) return true;
    if (!s.product || !s.product.active) return false;
    return s.product.variants.some((v) => v.stock > 0);
  });

  // Weighted shuffle: expand each slide into `weight` entries, shuffle, then
  // dedupe while walking. Keeps the distribution O(n·weight).
  const pool: string[] = [];
  for (const s of eligible) {
    const w = Math.max(1, Math.min(10, s.weight));
    for (let i = 0; i < w; i++) pool.push(s.id);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const byId = new Map(eligible.map((s) => [s.id, s]));
  const picked: EffectiveSlide[] = [];
  const seen = new Set<string>();
  for (const id of pool) {
    if (seen.has(id)) continue;
    seen.add(id);
    const s = byId.get(id);
    if (!s) continue;
    picked.push({
      id: s.id,
      imageUrl: s.imageUrl,
      imageAlt: s.imageAlt ?? undefined,
      headline: s.headlineOverride ?? s.headline,
      sub: (s.subOverride ?? s.sub) ?? undefined,
      ctaLabel: s.ctaLabelOverride ?? s.ctaLabel,
      ctaUrl: s.ctaUrlOverride ?? s.ctaUrl,
    });
    if (picked.length >= take) break;
  }
  return picked;
}

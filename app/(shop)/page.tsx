import Link from "next/link";
import type { Metadata } from "next";
import { Sparkle } from "@/components/Sparkle";
import { JsonLd, ORG_LD, WEBSITE_LD } from "@/components/JsonLd";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { UspBar } from "@/components/home/UspBar";
import { CategoryStrip } from "@/components/home/CategoryStrip";
import { NewsletterCard } from "@/components/home/NewsletterCard";
import { ReviewsWidget } from "@/components/home/ReviewsWidget";
import { HeroSlider } from "@/components/home/HeroSlider";
import { CampaignBanner } from "@/components/home/CampaignBanner";
import { LookbookGrid } from "@/components/home/LookbookGrid";
import { SITE_URL } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { ReviewStatus } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Brilho de Diva — Joias que realçam sua beleza" },
  description:
    "Joias e acessórios Brilho de Diva: colares, brincos e anéis com entrega para todo o Brasil. Pagamento via Pix, boleto ou cartão.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "Brilho de Diva",
    description: "Realce sua Beleza, Brilhe como uma Diva!",
    url: SITE_URL,
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Brilho de Diva",
    description: "Realce sua Beleza, Brilhe como uma Diva!",
  },
};

export default async function Home() {
  const [
    hero,
    uspSetting,
    featuredSetting,
    badgesSetting,
    newsletter,
    reviewsCfg,
    heroSlidesSetting,
    campaignSetting,
    lookbookSetting,
  ] = await Promise.all([
    getSetting("home.hero"),
    getSetting("home.usps"),
    getSetting("home.featuredCategories"),
    getSetting("home.badges"),
    getSetting("home.newsletter"),
    getSetting("home.reviews"),
    getSetting("home.heroSlides"),
    getSetting("home.campaignBanner"),
    getSetting("home.lookbook"),
  ]);

  // Filter slides by activeFrom/activeUntil at render time. The slider is
  // the "preferred" hero — when at least one slide is active, the legacy
  // glass card is suppressed so we don't stack two hero blocks.
  const now = Date.now();
  const activeSlides = heroSlidesSetting.slides.filter((s) => {
    if (!s.imageUrl || !s.headline) return false;
    if (s.activeFrom) {
      const from = new Date(s.activeFrom).getTime();
      if (Number.isFinite(from) && now < from) return false;
    }
    if (s.activeUntil) {
      const until = new Date(s.activeUntil).getTime();
      if (Number.isFinite(until) && now > until) return false;
    }
    return true;
  });
  const showLegacyHero = hero.enabled && activeSlides.length === 0;

  // Featured products. Badges computed server-side from (createdAt within
  // home.badges.newDays) and (top-N by order volume in last 30d when
  // home.badges.showBestseller is on).
  const featured = await prisma.product.findMany({
    where: { active: true, images: { some: {} } },
    include: {
      images: { orderBy: { position: "asc" }, take: 3 },
      variants: { orderBy: { priceCents: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 9,
  });

  // Bestseller detection — count OrderItem joins in the last 30 days.
  const bestsellerIds = new Set<string>();
  if (badgesSetting.showBestseller && featured.length > 0) {
    const sinceMs = Date.now() - 30 * 24 * 3600 * 1000;
    const rows = await prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { order: { createdAt: { gte: new Date(sinceMs) } } },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: 20,
    });
    if (rows.length > 0) {
      const variants = await prisma.variant.findMany({
        where: { id: { in: rows.map((r) => r.variantId) } },
        select: { id: true, productId: true },
      });
      const byVariant = new Map(variants.map((v) => [v.id, v.productId]));
      for (const r of rows) {
        const pid = byVariant.get(r.variantId);
        if (pid) bestsellerIds.add(pid);
        if (bestsellerIds.size >= 3) break;
      }
    }
  }

  const newCutoff = Date.now() - badgesSetting.newDays * 24 * 3600 * 1000;

  // Featured categories — when admin left the list empty, auto-pick the 4
  // categories with most active products. Otherwise use their selection,
  // preserving the order the admin chose.
  let categoryTiles: Array<{
    slug: string;
    name: string;
    imageUrl: string | null;
    productCount: number;
  }> = [];
  {
    const allCats = await prisma.category.findMany({
      select: {
        slug: true,
        name: true,
        _count: { select: { products: { where: { active: true } } } },
      },
    });
    const bySlug = new Map(allCats.map((c) => [c.slug, c]));
    const chosenSlugs =
      featuredSetting.slugs.length > 0
        ? featuredSetting.slugs.filter((s) => bySlug.has(s))
        : [...allCats]
            .filter((c) => c._count.products > 0)
            .sort((a, b) => b._count.products - a._count.products)
            .slice(0, 4)
            .map((c) => c.slug);
    if (chosenSlugs.length > 0) {
      // One query to pull one image per chosen category's first active product.
      const catImages = await prisma.product.findMany({
        where: {
          active: true,
          category: { slug: { in: chosenSlugs } },
          images: { some: {} },
        },
        select: {
          category: { select: { slug: true } },
          images: { orderBy: { position: "asc" }, take: 1 },
        },
      });
      const imageBySlug = new Map<string, string>();
      for (const p of catImages) {
        const slug = p.category?.slug;
        if (slug && !imageBySlug.has(slug) && p.images[0]) {
          imageBySlug.set(slug, p.images[0].url);
        }
      }
      categoryTiles = chosenSlugs.map((slug) => {
        const c = bySlug.get(slug)!;
        return {
          slug,
          name: c.name,
          imageUrl: imageBySlug.get(slug) ?? null,
          productCount: c._count.products,
        };
      });
    }
  }

  // Reviews aggregate + latest N for social proof.
  let reviewAgg: { avg: number | null; total: number } = { avg: null, total: 0 };
  let latestReviews: Array<{
    id: string;
    rating: number;
    body: string | null;
    createdAt: Date;
    customerName: string | null;
    productName: string;
    productSlug: string;
  }> = [];
  if (reviewsCfg.enabled) {
    const [stats, rows] = await Promise.all([
      prisma.review.aggregate({
        where: { status: ReviewStatus.PUBLISHED },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.review.findMany({
        where: { status: ReviewStatus.PUBLISHED },
        orderBy: { createdAt: "desc" },
        take: reviewsCfg.limit,
        include: {
          customer: { select: { name: true } },
          product: { select: { name: true, slug: true } },
        },
      }),
    ]);
    reviewAgg = { avg: stats._avg.rating, total: stats._count._all };
    latestReviews = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.createdAt,
      customerName: r.customer?.name ?? null,
      productName: r.product.name,
      productSlug: r.product.slug,
    }));
  }

  return (
    <main className="flex flex-col flex-1">
      <JsonLd data={ORG_LD} />
      <JsonLd data={WEBSITE_LD} />

      {activeSlides.length > 0 ? (
        <HeroSlider
          slides={activeSlides.map((s) => ({
            id: s.id,
            imageUrl: s.imageUrl,
            imageAlt: s.imageAlt,
            headline: s.headline,
            sub: s.sub,
            ctaLabel: s.ctaLabel,
            ctaUrl: s.ctaUrl,
          }))}
          autoplayMs={heroSlidesSetting.autoplayMs}
        />
      ) : null}

      {showLegacyHero ? (
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="relative w-full max-w-3xl">
          <Sparkle className="absolute -top-6 left-6 text-pink-200" size={28} delay="0s" />
          <Sparkle className="absolute top-10 right-8 text-pink-400" size={18} delay="0.6s" />
          <Sparkle className="absolute bottom-8 left-12 text-pink-200" size={22} delay="1.2s" />
          <Sparkle className="absolute -bottom-6 right-16 text-pink-400" size={16} delay="1.8s" />

          <div className="glass-card rounded-3xl px-8 py-16 sm:px-16 sm:py-20 text-center">
            {hero.kicker ? (
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pink-600)]/80 mb-6">
                {hero.kicker}
              </p>
            ) : null}

            <h1 className="font-display text-[color:var(--pink-600)] text-6xl sm:text-7xl leading-[1.1] drop-shadow-[0_2px_8px_rgba(210,58,133,0.25)]">
              {hero.title}
            </h1>

            <div className="flex items-center justify-center gap-2 mt-6">
              <span className="h-px w-16 bg-[color:var(--pink-400)]/60" />
              <span aria-hidden className="text-[color:var(--pink-500)] text-2xl">
                ⊰❀⊱
              </span>
              <span className="h-px w-16 bg-[color:var(--pink-400)]/60" />
            </div>

            <p className="mt-8 text-lg sm:text-xl text-[color:var(--pink-600)]/85 font-medium">
              {hero.subtitle}
            </p>

            <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={hero.ctaPrimary.url}
                className="inline-flex items-center justify-center rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-8 py-3 transition-colors shadow-lg shadow-pink-300/30"
              >
                {hero.ctaPrimary.label}
              </Link>
              {hero.ctaSecondary.label ? (
                <Link
                  href={hero.ctaSecondary.url}
                  className="inline-flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-[color:var(--pink-600)] font-medium px-8 py-3 transition-colors border border-white"
                >
                  {hero.ctaSecondary.label}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      ) : null}

      <UspBar items={uspSetting.items} />

      <CategoryStrip tiles={categoryTiles} />

      {featured.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-14 w-full">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pink-600)]/70">
                Em destaque
              </p>
              <h2 className="font-display text-3xl text-[color:var(--pink-600)]">
                Novidades da coleção
              </h2>
            </div>
            <Link
              href="/loja"
              className="text-sm text-[color:var(--pink-600)] hover:underline whitespace-nowrap"
            >
              Ver todas →
            </Link>
          </div>
          <FeaturedCarousel
            items={featured.map((p) => {
              const isNew = p.createdAt.getTime() >= newCutoff;
              const isBestseller = bestsellerIds.has(p.id);
              const badge: "new" | "bestseller" | null = isBestseller
                ? "bestseller"
                : isNew
                  ? "new"
                  : null;
              return {
                id: p.id,
                slug: p.slug,
                name: p.shortName ?? p.name,
                images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
                fromCents: p.variants[0]?.priceCents ?? 0,
                badge,
              };
            })}
          />
        </section>
      ) : null}

      {campaignSetting.enabled && campaignSetting.imageUrl ? (
        <CampaignBanner
          imageUrl={campaignSetting.imageUrl}
          imageAlt={campaignSetting.imageAlt}
          headline={campaignSetting.headline}
          sub={campaignSetting.sub}
          ctaLabel={campaignSetting.ctaLabel}
          ctaUrl={campaignSetting.ctaUrl}
        />
      ) : null}

      {lookbookSetting.enabled && lookbookSetting.items.length > 0 ? (
        <LookbookGrid
          headline={lookbookSetting.headline}
          sub={lookbookSetting.sub}
          items={lookbookSetting.items}
        />
      ) : null}

      {reviewsCfg.enabled ? (
        <ReviewsWidget
          avg={reviewAgg.avg}
          total={reviewAgg.total}
          latest={latestReviews}
        />
      ) : null}

      {newsletter.enabled ? (
        <NewsletterCard
          headline={newsletter.headline}
          sub={newsletter.sub}
          couponCode={newsletter.couponCode}
        />
      ) : null}
    </main>
  );
}

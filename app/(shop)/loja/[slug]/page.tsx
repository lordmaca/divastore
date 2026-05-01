import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { AddToCartForm } from "@/components/AddToCartForm";
import { JsonLd } from "@/components/JsonLd";
import { StarRating } from "@/components/StarRating";
import { ReviewForm } from "@/components/ReviewForm";
import { WishlistButton } from "@/components/WishlistButton";
import { getWishlistProductIdsForCustomer } from "@/lib/wishlist";
import { renderDescription } from "@/lib/description";
import { productJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { ProductGallery } from "@/components/ProductGallery";
import { youtubeId, youtubeEmbedUrl, youtubeThumbnail } from "@/lib/video";
import { getProductReviewSummary, customerEligibleToReview } from "@/lib/reviews";
import { SITE_URL as BASE } from "@/lib/config";
import type { Metadata } from "next";

// `force-dynamic` was breaking notFound() — Next 16 commits a 200 status
// before the boundary throws when force-dynamic is set, producing soft-404s
// on every unknown slug (Google-killer). Drop it; the page will still render
// dynamically because `auth()` reads cookies.
export const revalidate = 0;

async function loadProduct(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { priceCents: "asc" } },
      videos: { orderBy: { position: "asc" } },
      category: true,
      reviews: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { customer: { select: { name: true } } },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadProduct(slug);
  // Unknown slug — Next 16 commits a 200 status before notFound() / redirect()
  // throw because the (shop) layout begins streaming first. Workaround:
  // serve a noindex/nofollow metadata so Google won't index the URL, and
  // let the page itself render the not-found UI (the user-facing 404
  // experience is unchanged). Search Console will still report soft-404s
  // for these URLs but that's the correct signal — we WANT Google to
  // treat them as not-found and drop them from the index.
  if (!p || !p.active) {
    return {
      title: "Produto não encontrado · Brilho de Diva",
      description: "Esse produto não está mais disponível.",
      robots: { index: false, follow: false },
      alternates: { canonical: `${BASE}/loja` },
    };
  }
  const cover = p.images[0]?.url;

  // Prefer DivaHub-curated SEO when present; otherwise derive from content.
  const displayName = p.shortName ?? p.name;
  const title = p.seoTitle ?? `${displayName} — Brilho de Diva`;
  const description =
    p.seoDescription ?? p.description.replace(/\s+/g, " ").trim().slice(0, 155);

  return {
    title: { absolute: title },
    description,
    keywords: p.seoKeywords.length > 0 ? p.seoKeywords : undefined,
    alternates: { canonical: `${BASE}/loja/${p.slug}` },
    openGraph: {
      title: p.seoTitle ?? displayName,
      description: description.slice(0, 200),
      url: `${BASE}/loja/${p.slug}`,
      type: "website",
      images: cover ? [{ url: cover, alt: displayName }] : undefined,
      locale: "pt_BR",
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: p.seoTitle ?? displayName,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Existence check FIRST. generateMetadata returned noindex for unknown
  // slugs; the page renders the not-found UI for the user. notFound()
  // here triggers the slug-level not-found.tsx so the layout still works.
  const product = await loadProduct(slug);
  if (!product || !product.active) notFound();
  const session = await auth();

  const customerId = session?.user?.id;
  const [summary, eligibility, liked, related] = await Promise.all([
    getProductReviewSummary(product.id),
    customerId ? customerEligibleToReview(product.id, customerId) : Promise.resolve(null),
    getWishlistProductIdsForCustomer(customerId),
    // Related products from the same category (or newest actives as fallback).
    // Internal linking signal + cross-sell. Excludes the current product.
    prisma.product.findMany({
      where: {
        active: true,
        id: { not: product.id },
        ...(product.categoryId ? { categoryId: product.categoryId } : {}),
      },
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        variants: { orderBy: { priceCents: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);

  const cover = product.images[0];
  const cheapest = product.variants[0];
  const inStock = product.variants.some((v) => v.stock > 0);

  // SKU from the first variant is the canonical identifier across Storefront,
  // DivaHub, and Tiny ERP. Keep it stable — changing it creates a new variant
  // and orphans the old one (by design, to preserve OrderItem FK).
  const canonicalSku = cheapest?.sku ?? product.slug;
  const displayName = product.shortName ?? product.name;

  const productLd = productJsonLd({
    slug: product.slug,
    name: displayName,
    description: product.seoDescription ?? product.description,
    imageUrl: cover?.url,
    sku: canonicalSku,
    priceBRL: (cheapest?.priceCents ?? 0) / 100,
    inStock,
    reviewCount: summary.count,
    ratingAvg: summary.avg,
  });

  const crumbs = [
    { name: "Início", url: `${BASE}/` },
    { name: "Loja", url: `${BASE}/loja` },
    ...(product.category
      ? [{ name: product.category.name, url: `${BASE}/loja?categoria=${product.category.slug}` }]
      : []),
    { name: displayName, url: `${BASE}/loja/${product.slug}` },
  ];

  // VideoObject JSON-LD: Google uses this for the "video" rich result and
  // video carousel. Only emit when we have an embeddable YouTube source — the
  // other platforms need their own schemas that we can add later.
  const firstYt = product.videos.find((v) => v.source === "YOUTUBE");
  const ytId = firstYt ? youtubeId(firstYt.url) : null;
  const videoLd = ytId
    ? {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: displayName,
        description: product.seoDescription ?? product.description.slice(0, 200),
        thumbnailUrl: [youtubeThumbnail(ytId), cover?.url].filter(Boolean),
        uploadDate: product.createdAt.toISOString(),
        embedUrl: youtubeEmbedUrl(ytId),
        contentUrl: firstYt!.url,
      }
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {videoLd ? <JsonLd data={videoLd} /> : null}

      <nav className="text-sm text-[color:var(--foreground)]/70 mb-6">
        <Link href="/loja" className="hover:text-[color:var(--pink-600)]">Loja</Link>
        {product.category ? (
          <>
            <span className="mx-2">/</span>
            <Link
              href={`/loja?categoria=${product.category.slug}`}
              className="hover:text-[color:var(--pink-600)]"
            >
              {product.category.name}
            </Link>
          </>
        ) : null}
        <span className="mx-2">/</span>
        <span>{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-10">
        <ProductGallery
          productName={displayName}
          media={[
            ...product.images.map((i) => ({
              kind: "image" as const,
              id: i.id,
              url: i.url,
              alt: i.alt ?? null,
            })),
            ...product.videos.map((v) => ({
              kind: "video" as const,
              id: v.id,
              url: v.url,
              source: v.source,
              format: v.kind,
            })),
          ]}
        />

        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <h1
              className="flex-1 font-semibold text-2xl sm:text-3xl leading-tight text-[color:var(--foreground)]"
              title={product.shortName ? product.name : undefined}
            >
              {displayName}
            </h1>
            <WishlistButton
              productId={product.id}
              initiallyLiked={liked.has(product.id)}
              isLoggedIn={Boolean(session?.user)}
            />
          </div>

          {summary.count > 0 ? (
            <div className="flex items-center gap-2 text-sm text-[color:var(--foreground)]/75">
              <StarRating value={summary.avg ?? 0} />
              <span>
                {summary.avg?.toFixed(1)} · {summary.count} {summary.count === 1 ? "avaliação" : "avaliações"}
              </span>
            </div>
          ) : null}

          {(() => {
            const desc = renderDescription(product.description);
            const baseCls =
              "prose-sm max-w-none text-[color:var(--foreground)]/85 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[color:var(--pink-600)] [&_a]:underline [&_h2]:font-semibold [&_h2]:text-base [&_h3]:font-semibold [&_h3]:text-sm";
            return desc.kind === "html" ? (
              <div className={baseCls} dangerouslySetInnerHTML={{ __html: desc.html }} />
            ) : (
              <div className={`${baseCls} whitespace-pre-wrap`}>{desc.text}</div>
            );
          })()}

          <div className="glass-card rounded-2xl p-6">
            <AddToCartForm
              variants={product.variants.map((v) => ({
                id: v.id,
                name: v.name,
                priceCents: v.priceCents,
                stock: v.stock,
                attributes: (v.attributes ?? null) as Record<string, unknown> | null,
              }))}
            />
          </div>

          <div className="text-sm text-[color:var(--foreground)]/70 space-y-1">
            <p>✦ Frete para todo o Brasil</p>
            <p>✦ Pagamento via Pix, Boleto ou Cartão</p>
            <p>✦ Garantia de 30 dias</p>
          </div>
        </div>
      </div>

      {/* Videos were here as a separate section; they now live inside the
          gallery above so shoppers don't have to scroll to find them. */}

      {related.length > 0 ? (
        <section className="mt-16 space-y-4">
          <h2 className="font-display text-2xl text-[color:var(--pink-600)]">Você também pode gostar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {related.map((r) => {
              const rCover = r.images[0]?.url;
              return (
                <Link
                  key={r.id}
                  href={`/loja/${r.slug}`}
                  className="group glass-card rounded-2xl overflow-hidden block hover:-translate-y-0.5 transition-transform"
                >
                  <div className="relative aspect-square bg-pink-50/50">
                    {rCover ? (
                      <Image
                        src={rCover}
                        alt={r.shortName ?? r.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                    ) : null}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-2 min-h-[2.5em]" title={r.name}>
                      {r.shortName ?? r.name}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--pink-600)] font-semibold">
                      a partir de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((r.variants[0]?.priceCents ?? 0) / 100)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-16 space-y-6">
        <h2 className="font-display text-2xl text-[color:var(--pink-600)]">Avaliações</h2>

        {product.reviews.length === 0 ? (
          <p className="text-sm text-[color:var(--foreground)]/65">
            Ainda não há avaliações para este produto.
          </p>
        ) : (
          <ul className="space-y-3">
            {product.reviews.map((r) => (
              <li key={r.id} className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2 text-sm">
                  <StarRating value={r.rating} />
                  <span className="font-medium">{r.customer.name ?? "Cliente"}</span>
                  <span className="text-[color:var(--foreground)]/55 text-xs">
                    · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {r.body ? (
                  <p className="mt-2 text-[color:var(--foreground)]/85 whitespace-pre-line">{r.body}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {eligibility?.eligible ? (
          <ReviewForm productId={product.id} productSlug={product.slug} />
        ) : eligibility?.reason === "already_reviewed" ? (
          <p className="text-sm text-[color:var(--foreground)]/65">Você já avaliou este produto. Obrigada!</p>
        ) : !session?.user ? (
          <p className="text-sm text-[color:var(--foreground)]/65">
            <Link href={`/login?next=/loja/${product.slug}`} className="text-[color:var(--pink-600)] hover:underline">
              Entre
            </Link>{" "}
            para deixar sua avaliação após uma compra.
          </p>
        ) : (
          <p className="text-sm text-[color:var(--foreground)]/65">
            Apenas clientes que compraram este produto podem deixar uma avaliação.
          </p>
        )}
      </section>
    </main>
  );
}

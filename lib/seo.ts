import { SITE_URL } from "@/lib/config";

type ProductLdInput = {
  slug: string;
  name: string;
  description: string;
  imageUrl?: string;
  sku: string;
  priceBRL: number;
  inStock: boolean;
  reviewCount: number;
  ratingAvg: number | null;
};

export function productJsonLd(p: ProductLdInput) {
  const base = SITE_URL;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    sku: p.sku,
    image: p.imageUrl ? [p.imageUrl] : undefined,
    brand: { "@type": "Brand", name: "Brilho de Diva" },
  };
  // Google rich-result spec rejects Offer with price=0; emit only when priced.
  if (p.priceBRL > 0) {
    ld.offers = {
      "@type": "Offer",
      url: `${base}/loja/${p.slug}`,
      priceCurrency: "BRL",
      price: p.priceBRL.toFixed(2),
      availability: p.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    };
  }
  if (p.reviewCount > 0 && p.ratingAvg != null) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: p.ratingAvg.toFixed(1),
      reviewCount: p.reviewCount,
    };
  }
  return ld;
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

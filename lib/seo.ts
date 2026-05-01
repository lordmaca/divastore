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
    // Doubles as MPN for unbranded inventory — strengthens Google's
    // entity matching when GTIN is absent and qualifies the page for
    // richer product-result cards.
    mpn: p.sku,
    category: "Apparel & Accessories > Jewelry",
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
      // Year-end priceValidUntil is a Google warning when AggregateRating
      // is present without it. Always set it; the value is loose by design.
      priceValidUntil: `${new Date().getFullYear()}-12-31`,
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

// LocalBusiness (JewelryStore) JSON-LD for the physical store. Pull data
// from the about-page setting so the admin can update address/hours
// without a redeploy. Returns null if the address isn't configured —
// emitting an incomplete LocalBusiness is worse than emitting none.
type AboutVisit = {
  storeName: string;
  address: string;
  city: string;
  state: string;
  openingDateIso: string;
  hours: string;
  mapUrl: string;
  shoppingUrl: string;
};

type AboutContact = {
  whatsapp: string;
  instagram: string;
  youtube?: string;
  email: string;
};

export function localBusinessJsonLd(
  visit: AboutVisit,
  contact: AboutContact,
): Record<string, unknown> | null {
  if (!visit.storeName || !visit.address || !visit.city) return null;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JewelryStore",
    name: visit.storeName,
    url: `${SITE_URL}/sobre`,
    image: `${SITE_URL}/icon.svg`,
    address: {
      "@type": "PostalAddress",
      streetAddress: visit.address,
      addressLocality: visit.city,
      addressRegion: visit.state,
      addressCountry: "BR",
    },
  };

  if (contact.email) ld.email = contact.email;
  if (contact.whatsapp) {
    // Best-effort E.164 — strip non-digits and prepend +55 if not present.
    const digits = contact.whatsapp.replace(/\D/g, "");
    const normalised = digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
    ld.telephone = normalised;
  }
  // sameAs[] is the strongest entity-disambiguation signal we can give
  // Google for a new brand. Every social profile we own goes here.
  const sameAs: string[] = [];
  if (contact.instagram) {
    const t = contact.instagram.trim();
    sameAs.push(t.startsWith("http") ? t : `https://instagram.com/${t.replace(/^@/, "")}`);
  }
  if (contact.youtube) {
    const t = contact.youtube.trim();
    sameAs.push(t.startsWith("http") ? t : `https://youtube.com/${t.replace(/^@/, "@")}`);
  }
  if (sameAs.length > 0) ld.sameAs = sameAs;

  if (visit.mapUrl) ld.hasMap = visit.mapUrl;
  if (visit.openingDateIso) ld.foundingDate = visit.openingDateIso;
  // Hours field is free-form pt-BR ("Seg a Sáb, 10h às 22h · Dom, 14h às 20h"),
  // not Schema's openingHoursSpecification format. Pass through as
  // openingHours plain string — Google parses as a fallback.
  if (visit.hours) ld.openingHours = visit.hours;

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

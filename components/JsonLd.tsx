import { SITE_URL } from "@/lib/config";

// Inline JSON-LD helper. Renders a <script type="application/ld+json"> tag.
// Use in server components to expose structured data to crawlers.
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      // We control the input, so the stringify is safe.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export const ORG_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Brilho de Diva",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  sameAs: [],
};

export const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Brilho de Diva",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/loja?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

import { SITE_URL } from "@/lib/config";

// Inline JSON-LD helper. Renders a <script type="application/ld+json"> tag.
// Used in server components to expose structured data to crawlers.
//
// Product name + description come from the DB (DivaHub inbound + admin
// CRUD). Either path CAN put raw HTML/JS in those fields — a Zod length
// cap doesn't stop `</script><script>alert(1)</script>`. Escape the
// forward slash in every `</` sequence so the JSON string can't break
// out of the surrounding <script> tag, plus `<!--` for old browsers and
// the U+2028 / U+2029 line separators (valid JSON, invalid JS literal
// terminators that older parsers mishandle).
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

function safeJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "<\\!--")
    .split(LINE_SEP)
    .join("\\u2028")
    .split(PARA_SEP)
    .join("\\u2029");
}

export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson(data) }}
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

import { prisma } from "@/lib/db";
import { SITE_URL as BASE } from "@/lib/config";

// 60 s ISR. Catalog mutations call `revalidateCatalogPublicSurfaces()`
// from lib/seo/cache.ts, which busts this cache instantly — so 60 s is
// the worst-case staleness for any signal Google or Merchant Center
// can see (price, stock, title, image). Generation is cheap (one
// findMany + a few hundred string concats) so we don't need to push it
// longer.
export const revalidate = 60;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Strip simple HTML tags and decode common entities so the description sent
// to Google is plain text. Google Merchant rejects items whose <g:description>
// contains HTML markup.
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Color values that count as a real `<g:color>` for GMC variant grouping.
// Material strings like "Aço Inoxidável 316L" or "Bijuteria Fina" are NOT
// colors — they're constructions; including them as <g:color> confuses GMC.
const COLOR_VALUES = new Set([
  "dourado",
  "prateado",
  "rose gold",
  "rosé gold",
  "rosegold",
  "grafite",
  "preto",
  "ouro",
  "prata",
]);

function variantSize(attrs: unknown): string | null {
  if (!attrs || typeof attrs !== "object") return null;
  const a = attrs as Record<string, unknown>;
  const t = typeof a.tamanho === "string" ? a.tamanho.trim() : "";
  return t || null;
}

function variantColor(attrs: unknown): string | null {
  if (!attrs || typeof attrs !== "object") return null;
  const a = attrs as Record<string, unknown>;
  const m = typeof a.material === "string" ? a.material.trim() : "";
  if (!m) return null;
  return COLOR_VALUES.has(m.toLowerCase()) ? m : null;
}

// Google Merchant Center product feed (RSS 2.0 + g: namespace).
// Each variant becomes one offer (Google indexes per-SKU). Variants of the
// same product are grouped via <g:item_group_id> + a variant-specific
// distinguishing attribute (size or color).
export async function GET() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      variants: { orderBy: { priceCents: "asc" } },
      category: true,
    },
  });

  const items: string[] = [];
  for (const p of products) {
    const cover = p.images[0]?.url;
    // Google Merchant rejects items without an image. Skip the whole product
    // until a cover image exists rather than emitting a guaranteed-rejected entry.
    if (!cover) continue;

    // Filter out orphan/parent variants when the product also has named
    // variants — those used to pollute the picker and the feed (the
    // `Bijuteriafina` ghost variant). Keeps feed entries 1:1 with what a
    // shopper can actually buy.
    const anyNamed = p.variants.some((v) => (v.name ?? "").trim().length > 0);
    const visible = anyNamed
      ? p.variants.filter((v) => (v.name ?? "").trim().length > 0)
      : p.variants;
    if (visible.length === 0) continue;

    // Skip explicitly-retired variants. The "Obsoleto" SKU pattern is what
    // we use locally to mark a variant that should never reach catalogs.
    const sellable = visible.filter(
      (v) => !/obsolet/i.test(v.sku) && !/obsolet/i.test(v.name ?? ""),
    );
    if (sellable.length === 0) continue;

    const baseName = p.shortName ?? p.name;
    const baseDesc = stripHtml(p.seoDescription ?? p.description);
    // GMC rejects descriptions > 5000 chars. Defensive trim.
    const desc = baseDesc.slice(0, 4900);
    const hasMultipleVariants = sellable.length > 1;

    for (const v of sellable) {
      const link = `${BASE}/loja/${p.slug}`;
      const price = `${(v.priceCents / 100).toFixed(2)} BRL`;

      // Title: max 150 chars per GMC spec. Truncate the BASE name to leave
      // room for the variant suffix; otherwise the variant disambiguator
      // gets cut off and Google can't tell variants apart.
      const variantSuffix = v.name ? ` — ${v.name}` : "";
      const titleBudget = 150 - variantSuffix.length;
      const title = `${baseName.slice(0, titleBudget).trim()}${variantSuffix}`;

      const availability = v.stock > 0 ? "in_stock" : "out_of_stock";
      const size = variantSize(v.attributes);
      const color = variantColor(v.attributes);

      const lines = [
        "<item>",
        `<g:id>${escapeXml(v.sku)}</g:id>`,
        `<g:title>${escapeXml(title)}</g:title>`,
        `<g:description>${escapeXml(desc)}</g:description>`,
        `<g:link>${escapeXml(link)}</g:link>`,
        `<g:image_link>${escapeXml(cover)}</g:image_link>`,
        `<g:availability>${availability}</g:availability>`,
        `<g:price>${escapeXml(price)}</g:price>`,
        `<g:condition>new</g:condition>`,
        `<g:brand>Brilho de Diva</g:brand>`,
        // MPN doubles as our variant identifier — strengthens Google's match
        // even with identifier_exists=no, and qualifies for richer cards.
        `<g:mpn>${escapeXml(v.sku)}</g:mpn>`,
        `<g:identifier_exists>no</g:identifier_exists>`,
        // Only emit the variant group when there's actually more than one
        // variant — otherwise GMC complains about a "group with one member".
        hasMultipleVariants
          ? `<g:item_group_id>${escapeXml(p.slug)}</g:item_group_id>`
          : "",
        // Variant disambiguators required by GMC when item_group_id is set.
        size ? `<g:size>${escapeXml(size)}</g:size>` : "",
        color ? `<g:color>${escapeXml(color)}</g:color>` : "",
        // GMC's "Apparel & Accessories > Jewelry" — taxonomy id 188 — is
        // the right bucket for everything we sell.
        `<g:google_product_category>Apparel &amp; Accessories &gt; Jewelry</g:google_product_category>`,
        p.category
          ? `<g:product_type>${escapeXml(p.category.name)}</g:product_type>`
          : "",
        // Year-end priceValidUntil is a Google rich-result requirement when
        // Offer ships with rating data; harmless when it doesn't.
        `<g:price_valid_until>${new Date().getFullYear()}-12-31</g:price_valid_until>`,
      ];

      items.push(lines.filter(Boolean).join("") + "</item>");
    }
  }

  // Shipping is configured at the GMC account level (settings → shipping
  // services), not per-item, because the actual cost depends on customer
  // CEP + cart weight (resolved at checkout via Melhor Envio). Hardcoding
  // 0.00 BRL here would constitute misrepresentation — Google has
  // suspended accounts for less. Keep this empty.

  // RFC 822 date for `lastBuildDate` (RSS 2.0 spec). Surfaces in the
  // top of the XML so an admin opening the URL in the browser can see
  // when this was last regenerated — and so Merchant Center has an
  // explicit freshness signal.
  const buildDate = new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Brilho de Diva</title>
    <link>${BASE}</link>
    <description>Joias e acessórios — Brilho de Diva</description>
    <lastBuildDate>${buildDate}</lastBuildDate>
    ${items.join("\n    ")}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // s-maxage=60 + SWR=30: clients/CDN may serve a 60 s stale doc
      // while we regenerate, but never older than 90 s in practice.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}

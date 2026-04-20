import { prisma } from "@/lib/db";
import { SITE_URL as BASE } from "@/lib/config";

export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Google Merchant Center product feed (RSS 2.0 + g: namespace).
// Each variant becomes one offer (Google indexes per-SKU).
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
    const baseName = p.shortName ?? p.name;
    const baseDesc = p.seoDescription ?? p.description;
    for (const v of p.variants) {
      const link = `${BASE}/loja/${p.slug}`;
      const price = `${(v.priceCents / 100).toFixed(2)} BRL`;
      const title = v.name ? `${baseName} — ${v.name}` : baseName;
      const availability = v.stock > 0 ? "in_stock" : "out_of_stock";
      items.push(
        [
          "<item>",
          `<g:id>${escapeXml(v.sku)}</g:id>`,
          `<g:title>${escapeXml(title)}</g:title>`,
          `<g:description>${escapeXml(baseDesc)}</g:description>`,
          `<g:link>${escapeXml(link)}</g:link>`,
          `<g:image_link>${escapeXml(cover)}</g:image_link>`,
          `<g:availability>${availability}</g:availability>`,
          `<g:price>${escapeXml(price)}</g:price>`,
          `<g:condition>new</g:condition>`,
          `<g:brand>Brilho de Diva</g:brand>`,
          `<g:identifier_exists>no</g:identifier_exists>`,
          `<g:item_group_id>${escapeXml(p.slug)}</g:item_group_id>`,
          p.category ? `<g:google_product_category>Apparel &amp; Accessories &gt; Jewelry</g:google_product_category>` : "",
          p.category ? `<g:product_type>${escapeXml(p.category.name)}</g:product_type>` : "",
          `<g:shipping><g:country>BR</g:country><g:service>Standard</g:service><g:price>0.00 BRL</g:price></g:shipping>`,
          "</item>",
        ].join(""),
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Brilho de Diva</title>
    <link>${BASE}</link>
    <description>Joias e acessórios — Brilho de Diva</description>
    ${items.join("\n    ")}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}

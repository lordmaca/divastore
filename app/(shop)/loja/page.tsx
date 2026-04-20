import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/ProductCard";
import { auth } from "@/lib/auth";
import { getWishlistProductIdsForCustomer } from "@/lib/wishlist";
import { SITE_URL } from "@/lib/config";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";
import { shortName } from "@/lib/description";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const CATS = [
  { slug: undefined, name: "Tudo" },
  { slug: "colares", name: "Colares" },
  { slug: "brincos", name: "Brincos" },
  { slug: "aneis", name: "Anéis" },
] as const;

// catLabel maps a real category slug to its human label. Returns undefined
// for the "all products" (no slug) case so SEO metadata doesn't use "Tudo".
function catLabel(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  return CATS.find((c) => c.slug === slug)?.name;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>;
}): Promise<Metadata> {
  const { categoria, q } = await searchParams;
  const label = catLabel(categoria);
  const query = q?.trim();

  let title = "Loja — Brilho de Diva";
  let description =
    "Joias e acessórios para realçar sua beleza. Colares, brincos e anéis com entrega para todo o Brasil.";
  let canonical = `${SITE_URL}/loja`;
  let robots: Metadata["robots"] | undefined;

  if (label) {
    title = `${label} — Brilho de Diva`;
    description = `Coleção de ${label.toLowerCase()} Brilho de Diva. Peças exclusivas, entrega para todo o Brasil.`;
    canonical = `${SITE_URL}/loja?categoria=${categoria}`;
  } else if (query) {
    title = `Busca: ${query} — Brilho de Diva`;
    description = `Resultados para "${query}" na loja Brilho de Diva.`;
    canonical = `${SITE_URL}/loja`; // search results canonicalize to /loja
    robots = { index: false, follow: true }; // don't index search pages
  }

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      locale: "pt_BR",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function LojaPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
  const { categoria, q } = await searchParams;
  const query = q?.trim();
  const label = catLabel(categoria);

  const session = await auth();

  const [products, liked] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        ...(categoria ? { category: { slug: categoria } } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
                { variants: { some: { sku: { contains: query, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: {
        images: { orderBy: { position: "asc" }, take: 4 },
        variants: { orderBy: { priceCents: "asc" }, take: 1 },
        category: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    getWishlistProductIdsForCustomer(session?.user?.id),
  ]);

  // CollectionPage + ItemList JSON-LD for this catalog view.
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: label ? `${label} — Brilho de Diva` : "Loja — Brilho de Diva",
    url: label ? `${SITE_URL}/loja?categoria=${categoria}` : `${SITE_URL}/loja`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/loja/${p.slug}`,
        name: p.shortName ?? shortName(p.name, 70),
      })),
    },
  };

  const crumbs = [
    { name: "Início", url: `${SITE_URL}/` },
    { name: "Loja", url: `${SITE_URL}/loja` },
    ...(label
      ? [{ name: label, url: `${SITE_URL}/loja?categoria=${categoria}` }]
      : []),
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <JsonLd data={collectionLd} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="font-display text-4xl text-[color:var(--pink-600)]">
          {label ?? "Nossa coleção"}
        </h1>
        <form action="/loja" className="flex gap-2" method="get">
          {categoria ? <input type="hidden" name="categoria" value={categoria} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query ?? ""}
            placeholder="Buscar por nome ou SKU"
            className="rounded-full bg-white/80 border border-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300 w-56"
          />
          <button className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4 py-2">
            Buscar
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 text-sm mb-8">
        {CATS.map((c) => {
          const active = (categoria ?? undefined) === c.slug;
          const href = c.slug ? `/loja?categoria=${c.slug}` : "/loja";
          return (
            <Link
              key={c.name}
              href={href}
              className={`rounded-full px-4 py-1.5 transition-colors border ${
                active
                  ? "bg-[color:var(--pink-500)] text-white border-transparent"
                  : "bg-white/60 hover:bg-white border-white"
              }`}
            >
              {c.name}
            </Link>
          );
        })}
      </div>

      {query ? (
        <p className="text-sm text-[color:var(--foreground)]/70 mb-4">
          Resultados para <strong>&ldquo;{query}&rdquo;</strong> ({products.length})
        </p>
      ) : null}

      {products.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          {query ? "Nenhum produto encontrado para esta busca." : "Nenhum produto encontrado nessa categoria."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              productId={p.id}
              slug={p.slug}
              name={p.shortName ?? p.name}
              images={p.images.map((img) => ({ url: img.url, alt: img.alt }))}
              fromCents={p.variants[0]?.priceCents ?? 0}
              isLiked={liked.has(p.id)}
              isLoggedIn={Boolean(session?.user)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

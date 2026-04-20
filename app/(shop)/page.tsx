import Link from "next/link";
import type { Metadata } from "next";
import { Sparkle } from "@/components/Sparkle";
import { JsonLd, ORG_LD, WEBSITE_LD } from "@/components/JsonLd";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { SITE_URL } from "@/lib/config";
import { prisma } from "@/lib/db";

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
  const featured = await prisma.product.findMany({
    where: { active: true, images: { some: {} } },
    include: {
      images: { orderBy: { position: "asc" }, take: 3 },
      variants: { orderBy: { priceCents: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 9,
  });

  return (
    <main className="flex flex-col flex-1">
      <JsonLd data={ORG_LD} />
      <JsonLd data={WEBSITE_LD} />

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="relative w-full max-w-3xl">
          <Sparkle className="absolute -top-6 left-6 text-pink-200" size={28} delay="0s" />
          <Sparkle className="absolute top-10 right-8 text-pink-400" size={18} delay="0.6s" />
          <Sparkle className="absolute bottom-8 left-12 text-pink-200" size={22} delay="1.2s" />
          <Sparkle className="absolute -bottom-6 right-16 text-pink-400" size={16} delay="1.8s" />

          <div className="glass-card rounded-3xl px-8 py-16 sm:px-16 sm:py-20 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pink-600)]/80 mb-6">
              DivaHub · AI Portal
            </p>

            <h1 className="font-display text-[color:var(--pink-600)] text-6xl sm:text-7xl leading-[1.1] drop-shadow-[0_2px_8px_rgba(210,58,133,0.25)]">
              Brilho de Diva
            </h1>

            <div className="flex items-center justify-center gap-2 mt-6">
              <span className="h-px w-16 bg-[color:var(--pink-400)]/60" />
              <span aria-hidden className="text-[color:var(--pink-500)] text-2xl">
                ⊰❀⊱
              </span>
              <span className="h-px w-16 bg-[color:var(--pink-400)]/60" />
            </div>

            <p className="mt-8 text-lg sm:text-xl text-[color:var(--pink-600)]/85 font-medium">
              Realce sua Beleza, Brilhe como uma Diva!
            </p>

            <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/loja"
                className="inline-flex items-center justify-center rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-8 py-3 transition-colors shadow-lg shadow-pink-300/30"
              >
                Explorar a coleção
              </Link>
              <Link
                href="/sobre"
                className="inline-flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-[color:var(--pink-600)] font-medium px-8 py-3 transition-colors border border-white"
              >
                Nossa história
              </Link>
            </div>
          </div>
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20 w-full">
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
            items={featured.map((p) => ({
              id: p.id,
              slug: p.slug,
              name: p.shortName ?? p.name,
              images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
              fromCents: p.variants[0]?.priceCents ?? 0,
            }))}
          />
        </section>
      ) : null}
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSetting } from "@/lib/settings";
import { SITE_URL } from "@/lib/config";
import { JsonLd } from "@/components/JsonLd";
import { localBusinessJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSetting("about.page");
  const title = `${page.heading} · Brilho de Diva`;
  const description = page.tagline || page.story.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/sobre` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/sobre`,
      type: "website",
      images: page.media.type === "image" && page.media.url ? [page.media.url] : undefined,
    },
  };
}

function youtubeId(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/) ??
    null;
  return m ? m[1] : null;
}

function daysSince(iso: string): number {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function formatPtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function SobrePage() {
  const page = await getSetting("about.page");
  if (!page.enabled) notFound();

  const openingLabel = page.visit.openingDateIso ? formatPtDate(page.visit.openingDateIso) : "";
  const days = page.visit.openingDateIso ? daysSince(page.visit.openingDateIso) : 0;
  const localBusiness = localBusinessJsonLd(page.visit, page.contact);

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14 space-y-12">
      {/* LocalBusiness/JewelryStore JSON-LD — strongest "physical store in
          Mauá" signal we can give Google. Pulled from the about.page setting
          so admin updates flow without redeploys. */}
      {localBusiness ? <JsonLd data={localBusiness} /> : null}

      {/* Header */}
      <header className="text-center space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--pink-500)]">
          Brilho de Diva
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-[color:var(--pink-600)]">
          {page.heading}
        </h1>
        {page.tagline ? (
          <p className="max-w-2xl mx-auto text-[color:var(--foreground)]/75">
            {page.tagline}
          </p>
        ) : null}
      </header>

      {/* Media */}
      {page.media.type !== "none" && page.media.url ? (
        <div className="glass-card rounded-3xl overflow-hidden">
          <AboutMedia
            type={page.media.type}
            url={page.media.url}
            alt={page.media.alt || page.visit.storeName}
          />
        </div>
      ) : null}

      {/* Story */}
      <section className="prose prose-neutral max-w-none">
        <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
          <h2 className="font-display text-2xl text-[color:var(--pink-600)] m-0">
            Nossa história
          </h2>
          {page.story.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="text-[color:var(--foreground)]/85 leading-relaxed whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      </section>

      {/* Pillars */}
      {page.pillars.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-3">
          {page.pillars.map((p, i) => (
            <div key={i} className="glass-card rounded-2xl p-5 space-y-2">
              <div className="text-3xl">{p.icon || "✨"}</div>
              <h3 className="font-semibold text-[color:var(--pink-600)]">{p.title}</h3>
              <p className="text-sm text-[color:var(--foreground)]/75 leading-relaxed">
                {p.description}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {/* Visit */}
      <section className="glass-card rounded-3xl p-6 sm:p-8 grid gap-6 sm:grid-cols-[1fr_auto] items-center">
        <div className="space-y-2">
          <h2 className="font-display text-2xl text-[color:var(--pink-600)]">Venha nos visitar</h2>
          <p className="text-[color:var(--foreground)]/85">
            <strong>{page.visit.storeName}</strong>
          </p>
          <p className="text-sm text-[color:var(--foreground)]/75">
            {page.visit.address}
            {page.visit.city ? ` · ${page.visit.city}` : ""}
            {page.visit.state ? `/${page.visit.state}` : ""}
          </p>
          {page.visit.hours ? (
            <p className="text-sm text-[color:var(--foreground)]/75">
              <span className="font-medium">Horário:</span> {page.visit.hours}
            </p>
          ) : null}
          {openingLabel ? (
            <p className="text-xs text-[color:var(--foreground)]/60">
              Abrimos as portas em {openingLabel}
              {days > 0 ? ` · ${days.toLocaleString("pt-BR")} dias brilhando` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {page.visit.mapUrl ? (
            <a
              href={page.visit.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4 py-2"
            >
              Como chegar ↗
            </a>
          ) : null}
          {page.visit.shoppingUrl ? (
            <a
              href={page.visit.shoppingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-white/70 hover:bg-white text-sm font-medium px-4 py-2 border border-white"
            >
              Sobre o shopping ↗
            </a>
          ) : null}
        </div>
      </section>

      {/* Contact / Follow */}
      {(page.contact.whatsapp || page.contact.instagram || page.contact.youtube || page.contact.email) ? (
        <section className="text-center space-y-3">
          <h2 className="font-display text-2xl text-[color:var(--pink-600)]">
            Fica com a gente ✨
          </h2>
          <p className="text-sm text-[color:var(--foreground)]/70 max-w-xl mx-auto">
            Siga nossos canais para ver as novidades, tirar dúvidas e pedir dicas.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {page.contact.instagram ? (
              <a
                href={normalizeInstagram(page.contact.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/70 hover:bg-white text-sm px-4 py-2 border border-white inline-flex items-center gap-2"
              >
                📸 Instagram
              </a>
            ) : null}
            {page.contact.youtube ? (
              <a
                href={normalizeYoutube(page.contact.youtube)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/70 hover:bg-white text-sm px-4 py-2 border border-white inline-flex items-center gap-2"
              >
                ▶ YouTube
              </a>
            ) : null}
            {page.contact.whatsapp ? (
              <a
                href={whatsappHref(page.contact.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 inline-flex items-center gap-2"
              >
                💬 WhatsApp
              </a>
            ) : null}
            {page.contact.email ? (
              <a
                href={`mailto:${page.contact.email}`}
                className="rounded-full bg-white/70 hover:bg-white text-sm px-4 py-2 border border-white inline-flex items-center gap-2"
              >
                ✉ {page.contact.email}
              </a>
            ) : null}
          </div>
          <p className="pt-4 text-sm">
            <Link href="/loja" className="text-[color:var(--pink-600)] hover:underline font-medium">
              Ver a loja completa →
            </Link>
          </p>
        </section>
      ) : null}
    </main>
  );
}

function AboutMedia({
  type,
  url,
  alt,
}: {
  type: "image" | "video" | "none";
  url: string;
  alt: string;
}) {
  if (type === "image") {
    return (
      <div className="relative w-full aspect-video bg-[color:var(--pink-50)]">
        {/* Admin-uploaded URL can point anywhere — use a plain img to avoid
            remote-host config churn in next.config. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="absolute inset-0 w-full h-full object-cover" />
      </div>
    );
  }
  if (type === "video") {
    const yt = youtubeId(url);
    if (yt) {
      return (
        <div className="relative w-full aspect-video">
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${yt}?rel=0`}
            title={alt}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    return (
      <div className="relative w-full aspect-video bg-black">
        {/* Direct mp4/webm — admin hosts somewhere (S3, OCI) and pastes the URL. */}
        <video
          className="absolute inset-0 w-full h-full"
          src={url}
          controls
          playsInline
          preload="metadata"
        >
          {alt}
        </video>
      </div>
    );
  }
  return null;
}

function whatsappHref(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("http")) return raw;
  if (!digits) return "#";
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}

function normalizeInstagram(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("http")) return t;
  const handle = t.replace(/^@/, "");
  return `https://instagram.com/${handle}`;
}

function normalizeYoutube(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("http")) return t;
  // Accept "@Handle" or bare "Handle" — YouTube uses the @-handle URL.
  const handle = t.startsWith("@") ? t : `@${t}`;
  return `https://www.youtube.com/${handle}`;
}


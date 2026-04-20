import Link from "next/link";

type Props = {
  imageUrl: string;
  imageAlt?: string;
  headline: string;
  sub?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

export function CampaignBanner({
  imageUrl,
  imageAlt,
  headline,
  sub,
  ctaLabel,
  ctaUrl,
}: Props) {
  if (!imageUrl || !headline) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 w-full">
      <div className="relative rounded-3xl overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={imageAlt ?? headline}
          loading="lazy"
          className="w-full h-[280px] sm:h-[340px] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="px-6 sm:px-12 max-w-xl text-white">
            <h2 className="font-display text-3xl sm:text-4xl leading-tight drop-shadow">
              {headline}
            </h2>
            {sub ? <p className="mt-3 text-sm sm:text-base text-white/90">{sub}</p> : null}
            {ctaLabel ? (
              <Link
                href={ctaUrl || "/loja"}
                className="mt-5 inline-flex items-center justify-center rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-2.5 shadow-lg"
              >
                {ctaLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

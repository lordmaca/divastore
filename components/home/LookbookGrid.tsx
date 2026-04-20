import Link from "next/link";

export type LookbookItem = {
  id: string;
  imageUrl: string;
  imageAlt?: string;
  caption?: string;
  linkUrl?: string;
};

type Props = {
  headline: string;
  sub?: string;
  items: LookbookItem[];
};

export function LookbookGrid({ headline, sub, items }: Props) {
  const usable = items.filter((it) => it.imageUrl);
  if (usable.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 w-full">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pink-600)]/70">
          Lookbook
        </p>
        <h2 className="font-display text-3xl text-[color:var(--pink-600)]">
          {headline}
        </h2>
        {sub ? (
          <p className="mt-1 text-sm text-[color:var(--foreground)]/70">{sub}</p>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {usable.map((it) => {
          const content = (
            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-sm group-hover:shadow-lg group-hover:-translate-y-0.5 transition">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.imageUrl}
                alt={it.imageAlt ?? it.caption ?? ""}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {it.caption ? (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <p className="absolute inset-x-3 bottom-3 text-white text-sm font-medium drop-shadow">
                    {it.caption}
                  </p>
                </>
              ) : null}
            </div>
          );
          return (
            <li key={it.id}>
              {it.linkUrl ? (
                <Link href={it.linkUrl} className="block group">
                  {content}
                </Link>
              ) : (
                <div className="block group">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

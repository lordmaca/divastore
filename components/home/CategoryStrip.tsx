import Link from "next/link";

type Tile = {
  slug: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
};

export function CategoryStrip({ tiles }: { tiles: Tile[] }) {
  if (!tiles || tiles.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 w-full">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pink-600)]/70">
          Por categoria
        </p>
        <h2 className="font-display text-3xl text-[color:var(--pink-600)]">
          Escolha seu estilo
        </h2>
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map((t) => (
          <li key={t.slug}>
            <Link
              href={`/loja?categoria=${t.slug}`}
              className="group relative block aspect-[4/5] rounded-2xl overflow-hidden bg-gradient-to-br from-pink-100 via-white to-pink-50 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              {t.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.imageUrl}
                  alt={t.name}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-5xl text-[color:var(--pink-400)]/40">
                  ✨
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <div className="absolute inset-x-3 bottom-3 text-white">
                <p className="font-semibold text-base sm:text-lg drop-shadow">
                  {t.name}
                </p>
                <p className="text-xs opacity-80">
                  {t.productCount} {t.productCount === 1 ? "peça" : "peças"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";

type ReviewDto = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date | string;
  customerName: string | null;
  productName: string;
  productSlug: string;
};

type Props = {
  avg: number | null;
  total: number;
  latest: ReviewDto[];
};

export function ReviewsWidget({ avg, total, latest }: Props) {
  if (total === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 w-full">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--pink-600)]/70">
            Quem já é Diva conta
          </p>
          <h2 className="font-display text-3xl text-[color:var(--pink-600)]">
            Avaliações da nossa comunidade
          </h2>
        </div>
        <Aggregate avg={avg} total={total} />
      </div>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {latest.map((r) => (
          <li key={r.id} className="glass-card rounded-2xl p-5 space-y-2">
            <Stars rating={r.rating} />
            {r.body ? (
              <p className="text-sm text-[color:var(--foreground)]/85 leading-relaxed line-clamp-5">
                “{r.body}”
              </p>
            ) : null}
            <div className="text-xs text-[color:var(--foreground)]/65 pt-2 border-t border-white/60">
              <p className="font-medium text-[color:var(--foreground)]/80">
                {r.customerName ?? "Cliente"}
              </p>
              <p>
                sobre{" "}
                <Link
                  href={`/loja/${r.productSlug}`}
                  className="text-[color:var(--pink-600)] hover:underline"
                >
                  {r.productName}
                </Link>{" "}
                ·{" "}
                {new Date(r.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Aggregate({ avg, total }: { avg: number | null; total: number }) {
  return (
    <div className="flex items-center gap-2 text-right">
      <Stars rating={Math.round(avg ?? 0)} size="lg" />
      <div className="text-sm">
        <p className="font-semibold text-[color:var(--pink-600)]">
          {(avg ?? 0).toFixed(1)} / 5
        </p>
        <p className="text-xs text-[color:var(--foreground)]/65">
          {total} {total === 1 ? "avaliação" : "avaliações"}
        </p>
      </div>
    </div>
  );
}

function Stars({ rating, size = "md" }: { rating: number; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-xl" : "text-base";
  return (
    <div className={`flex items-center ${cls}`} aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={n <= rating ? "text-amber-400" : "text-[color:var(--foreground)]/20"}
        >
          ★
        </span>
      ))}
    </div>
  );
}

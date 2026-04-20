import Link from "next/link";
import { prisma } from "@/lib/db";
import { StarRating } from "@/components/StarRating";
import { ReviewStatusButtons } from "@/components/admin/ReviewStatusButtons";
import { ReviewStatus } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function ReviewsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const where =
    status === "HIDDEN" || status === "PUBLISHED" ? { status: status as ReviewStatus } : {};

  const [reviews, counts] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        product: { select: { slug: true, name: true } },
        customer: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.review.groupBy({ by: ["status"], _count: true }),
  ]);

  const by = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Avaliações</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">
            {by[ReviewStatus.PUBLISHED] ?? 0} publicadas · {by[ReviewStatus.HIDDEN] ?? 0} escondidas
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <FilterLink href="/admin/avaliacoes" active={!status} label="Todas" />
          <FilterLink href="/admin/avaliacoes?status=PUBLISHED" active={status === "PUBLISHED"} label="Publicadas" />
          <FilterLink href="/admin/avaliacoes?status=HIDDEN" active={status === "HIDDEN"} label="Escondidas" />
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Nenhuma avaliação nesse filtro.
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className={`glass-card rounded-2xl p-4 ${r.status === ReviewStatus.HIDDEN ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <StarRating value={r.rating} />
                    <span className="font-medium">{r.customer.name ?? "Cliente"}</span>
                    <span className="text-[color:var(--foreground)]/55 text-xs">{r.customer.email}</span>
                    <span className="text-[color:var(--foreground)]/55 text-xs">
                      · {new Date(r.createdAt).toLocaleString("pt-BR")}
                    </span>
                    {r.status === ReviewStatus.HIDDEN ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">escondida</span>
                    ) : null}
                  </div>
                  <Link
                    href={`/loja/${r.product.slug}`}
                    className="block mt-1 text-sm text-[color:var(--pink-600)] hover:underline"
                  >
                    {r.product.name}
                  </Link>
                  {r.body ? (
                    <p className="mt-2 text-[color:var(--foreground)]/85 whitespace-pre-line">{r.body}</p>
                  ) : (
                    <p className="mt-2 text-xs text-[color:var(--foreground)]/55 italic">sem comentário</p>
                  )}
                </div>
                <ReviewStatusButtons id={r.id} current={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 border ${
        active
          ? "bg-[color:var(--pink-500)] text-white border-transparent"
          : "bg-white/70 hover:bg-white border-white"
      }`}
    >
      {label}
    </Link>
  );
}

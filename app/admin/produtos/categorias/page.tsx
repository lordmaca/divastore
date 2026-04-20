import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { CategoryIssueStatus } from "@/lib/generated/prisma/enums";
import { CategoryIssueRow } from "@/components/admin/CategoryIssueRow";
import { CategoryScanControls } from "@/components/admin/CategoryScanControls";

export const dynamic = "force-dynamic";

// Admin review queue for category mismatches. Surfaces every OPEN issue
// (plus optional filter by confidence). High-confidence items are usually
// already auto-applied by the cron — rows here are the medium/low cases
// that need a human.
export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ confidence?: string; status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const confidence =
    sp.confidence === "high" || sp.confidence === "medium" || sp.confidence === "low"
      ? sp.confidence
      : undefined;
  const status = sp.status === "all" ? null : CategoryIssueStatus.OPEN;

  const [issues, categories, openHighCount, totals] = await Promise.all([
    prisma.categoryAuditIssue.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(confidence ? { confidence } : {}),
      },
      orderBy: [{ confidence: "asc" }, { createdAt: "desc" }],
      include: { product: { select: { name: true, slug: true } } },
      take: 200,
    }),
    prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
    prisma.categoryAuditIssue.count({
      where: { status: CategoryIssueStatus.OPEN, confidence: "high" },
    }),
    prisma.categoryAuditIssue.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const totalsByStatus = Object.fromEntries(totals.map((t) => [t.status, t._count._all]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
          Categorias — revisão
        </h1>
        <p className="text-sm text-[color:var(--foreground)]/70">
          Produtos que o classificador detectou fora da categoria indicada pelo nome.
          Itens de alta confiança são aplicados automaticamente pelo scan diário; medidas
          e baixas ficam aqui para decisão humana.
        </p>
        <p className="text-xs text-[color:var(--foreground)]/55 mt-2">
          <strong>Pendentes:</strong> {totalsByStatus.OPEN ?? 0} ·{" "}
          <strong>Auto-aplicadas:</strong> {totalsByStatus.AUTO_APPLIED ?? 0} ·{" "}
          <strong>Resolvidas:</strong> {totalsByStatus.RESOLVED ?? 0} ·{" "}
          <strong>Dispensadas:</strong> {totalsByStatus.DISMISSED ?? 0}
        </p>
      </div>

      <CategoryScanControls openHighCount={openHighCount} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[color:var(--foreground)]/60 mr-1">Confiança:</span>
        {(["high", "medium", "low"] as const).map((c) => (
          <a
            key={c}
            href={`/admin/produtos/categorias${
              confidence === c ? "" : `?confidence=${c}`
            }`}
            className={`rounded-full px-2.5 py-0.5 border ${
              confidence === c
                ? "bg-[color:var(--pink-500)] text-white border-transparent"
                : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
            }`}
          >
            {c === "high" ? "alta" : c === "medium" ? "média" : "baixa"}
          </a>
        ))}
        <span className="ml-3 text-[color:var(--foreground)]/60">Status:</span>
        <a
          href={`/admin/produtos/categorias${confidence ? `?confidence=${confidence}` : ""}`}
          className={`rounded-full px-2.5 py-0.5 border ${
            status === CategoryIssueStatus.OPEN
              ? "bg-[color:var(--pink-500)] text-white border-transparent"
              : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
          }`}
        >
          pendentes
        </a>
        <a
          href={`/admin/produtos/categorias?status=all${
            confidence ? `&confidence=${confidence}` : ""
          }`}
          className={`rounded-full px-2.5 py-0.5 border ${
            !status
              ? "bg-[color:var(--pink-500)] text-white border-transparent"
              : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
          }`}
        >
          todas
        </a>
      </div>

      {issues.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/65 text-sm">
          Nenhuma inconsistência detectada. Catálogo limpo 💗
        </div>
      ) : (
        <ul className="space-y-3">
          {issues.map((i) => {
            const current = i.currentCategoryId ? catById.get(i.currentCategoryId) : null;
            const suggested = i.suggestedCategoryId ? catById.get(i.suggestedCategoryId) : null;
            const evidence = (i.evidence ?? {}) as {
              score?: number;
              matches?: Array<{ pattern: string; weight: number }>;
            };
            return (
              <CategoryIssueRow
                key={i.id}
                issueId={i.id}
                productId={i.productId}
                productName={i.product.name}
                productSlug={i.product.slug}
                currentCategoryName={current?.name ?? "—"}
                suggestedCategoryName={suggested?.name ?? "—"}
                confidence={(i.confidence as "high" | "medium" | "low") ?? "low"}
                score={evidence.score ?? 0}
                matches={evidence.matches ?? []}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

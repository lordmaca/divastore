import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { ProductSource } from "@/lib/generated/prisma/enums";
import { ProductBulkTable } from "@/components/admin/ProductBulkTable";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; status?: string }>;
}) {
  await requireAdmin();
  const { q, source, status } = await searchParams;

  const products = await prisma.product.findMany({
    where: {
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }
        : {}),
      ...(source && (source === "MANUAL" || source === "DIVAHUB") ? { source: source as ProductSource } : {}),
      ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
    },
    include: {
      images: { take: 1, orderBy: { position: "asc" } },
      variants: { orderBy: { priceCents: "asc" }, take: 1 },
      _count: { select: { variants: true, reviews: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Produtos</h1>
        <Link
          href="/admin/produtos/novo"
          className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4 py-2"
        >
          + Novo produto
        </Link>
      </div>

      <form className="glass-card rounded-2xl p-4 grid sm:grid-cols-4 gap-3" action="/admin/produtos">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nome ou slug…"
          className="rounded-xl bg-white/80 border border-white px-3 py-2 text-sm sm:col-span-2"
        />
        <select name="source" defaultValue={source ?? ""} className="rounded-xl bg-white/80 border border-white px-3 py-2 text-sm">
          <option value="">Todas as origens</option>
          <option value="MANUAL">Manual</option>
          <option value="DIVAHUB">DivaHub</option>
        </select>
        <select name="status" defaultValue={status ?? ""} className="rounded-xl bg-white/80 border border-white px-3 py-2 text-sm">
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </select>
      </form>

      {products.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Nenhum produto encontrado.
        </div>
      ) : (
        <ProductBulkTable
          rows={products.map((p) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            source: p.source as "MANUAL" | "DIVAHUB",
            active: p.active,
            imageUrl: p.images[0]?.url ?? null,
            priceLabel: p.variants[0] ? formatBRL(p.variants[0].priceCents) : "—",
            variantCount: p._count.variants,
            reviewCount: p._count.reviews,
          }))}
        />
      )}
    </div>
  );
}

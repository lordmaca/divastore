import { prisma } from "@/lib/db";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export default async function NovoProdutoPage() {
  const categories = await prisma.category.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Novo produto</h1>
      <ProductForm mode="create" categories={categories} />
    </div>
  );
}

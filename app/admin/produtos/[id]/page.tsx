import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductForm } from "@/components/admin/ProductForm";
import { ProductSource } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        variants: { orderBy: { createdAt: "asc" } },
        images: { orderBy: { position: "asc" } },
        videos: { orderBy: { position: "asc" } },
        category: true,
      },
    }),
    prisma.category.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">{product.name}</h1>
          <p className="text-sm text-[color:var(--foreground)]/65 font-mono">{product.slug}</p>
        </div>
        <Link
          href={`/loja/${product.slug}`}
          className="rounded-full bg-white/70 hover:bg-white text-sm px-4 py-2 border border-white"
          target="_blank"
        >
          ↗ Ver na loja
        </Link>
      </div>

      <ProductForm
        mode="edit"
        productId={product.id}
        categories={categories}
        divahubManaged={product.source === ProductSource.DIVAHUB}
        initial={{
          slug: product.slug,
          name: product.name,
          shortName: product.shortName ?? undefined,
          description: product.description,
          active: product.active,
          seoTitle: product.seoTitle ?? undefined,
          seoDescription: product.seoDescription ?? undefined,
          seoKeywords: product.seoKeywords ?? [],
          category: product.category
            ? { slug: product.category.slug, name: product.category.name }
            : undefined,
          variants: product.variants.map((v) => ({
            sku: v.sku,
            name: v.name,
            priceCents: v.priceCents,
            stock: v.stock,
            weightG: v.weightG,
            attributes: (v.attributes ?? null) as Record<string, string | number | boolean> | null,
          })),
          images: product.images.map((i) => ({
            url: i.url,
            alt: i.alt ?? "",
            position: i.position,
          })),
          videos: product.videos.map((v) => ({
            url: v.url,
            source: v.source.toLowerCase() as "youtube" | "tiktok" | "instagram" | "oci",
            kind: v.kind.toLowerCase() as "reel" | "story",
          })),
        }}
      />
    </div>
  );
}

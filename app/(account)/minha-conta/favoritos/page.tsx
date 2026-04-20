import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/ProductCard";

export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/minha-conta/favoritos");

  // RSC reads stay in lib/wishlist.ts long-term; here we need the joined product
  // shape that the ProductCard expects, so we query directly.
  const items = await prisma.wishlistItem.findMany({
    where: { customerId: session.user.id },
    include: {
      product: {
        include: {
          images: { orderBy: { position: "asc" }, take: 4 },
          variants: { orderBy: { priceCents: "asc" }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
      <h1 className="font-display text-4xl text-[color:var(--pink-600)] mb-8">Meus favoritos</h1>
      {items.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p className="text-[color:var(--foreground)]/70 mb-6">Você ainda não favoritou nenhum produto.</p>
          <Link
            href="/loja"
            className="inline-flex rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-8 py-3"
          >
            Explorar a coleção
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((it) => (
            <ProductCard
              key={it.id}
              productId={it.product.id}
              slug={it.product.slug}
              name={it.product.shortName ?? it.product.name}
              images={it.product.images.map((img) => ({ url: img.url, alt: img.alt }))}
              fromCents={it.product.variants[0]?.priceCents ?? 0}
              isLiked={true}
              isLoggedIn={true}
            />
          ))}
        </div>
      )}
    </main>
  );
}

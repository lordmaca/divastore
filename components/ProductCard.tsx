import Link from "next/link";
import { formatBRL } from "@/lib/money";
import { WishlistButton } from "@/components/WishlistButton";
import { shortName } from "@/lib/description";
import { ProductCardSlideshow } from "@/components/ProductCardSlideshow";

type Props = {
  productId: string;
  slug: string;
  name: string;
  images: Array<{ url: string; alt?: string | null }>;
  fromCents: number;
  isLiked: boolean;
  isLoggedIn: boolean;
};

export function ProductCard({
  productId,
  slug,
  name,
  images,
  fromCents,
  isLiked,
  isLoggedIn,
}: Props) {
  return (
    <Link
      href={`/loja/${slug}`}
      className="group glass-card rounded-2xl overflow-hidden block transition-transform hover:-translate-y-1 relative"
    >
      <div className="absolute top-2 right-2 z-10">
        <WishlistButton productId={productId} initiallyLiked={isLiked} isLoggedIn={isLoggedIn} />
      </div>
      <div className="relative aspect-square bg-pink-50/50 overflow-hidden">
        <ProductCardSlideshow images={images} fallbackAlt={name} />
      </div>
      <div className="p-4">
        <h3
          className="font-medium text-[color:var(--foreground)] line-clamp-2 min-h-[3em]"
          title={name}
        >
          {shortName(name, 64)}
        </h3>
        <p className="mt-2 text-[color:var(--pink-600)] font-semibold">
          a partir de {formatBRL(fromCents)}
        </p>
      </div>
    </Link>
  );
}

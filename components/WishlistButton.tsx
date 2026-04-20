"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWishlist } from "@/lib/wishlist-actions";

type Props = {
  productId: string;
  initiallyLiked: boolean;
  isLoggedIn: boolean;
  className?: string;
  size?: number;
};

export function WishlistButton({ productId, initiallyLiked, isLoggedIn, className = "", size = 22 }: Props) {
  const router = useRouter();
  const [liked, setLiked] = useState(initiallyLiked);
  const [pending, start] = useTransition();
  const [errored, setErrored] = useState(false);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      router.push("/login?next=/loja");
      return;
    }
    start(async () => {
      try {
        const r = await toggleWishlist({ productId });
        setLiked(r.liked);
        setErrored(false);
      } catch {
        // Surface so the user can retry; don't lose the click silently.
        setErrored(true);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={liked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={liked}
      disabled={pending}
      title={errored ? "Erro ao salvar. Tente novamente." : undefined}
      className={`inline-flex items-center justify-center rounded-full shadow-sm w-9 h-9 transition-colors ${
        errored ? "bg-red-100 hover:bg-red-200" : "bg-white/85 hover:bg-white"
      } ${className}`}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M12 21s-7.5-4.6-9.6-9C.9 8.4 3 4.5 6.6 4.5c2 0 3.4 1 4.4 2.5l1 1.4 1-1.4c1-1.5 2.4-2.5 4.4-2.5C21 4.5 23.1 8.4 21.6 12 19.5 16.4 12 21 12 21Z"
          fill={liked ? "var(--pink-500)" : "none"}
          stroke="var(--pink-500)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

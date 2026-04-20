"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItem, removeCartItem } from "@/lib/cart-actions";
import { formatBRL } from "@/lib/money";

type Props = {
  id: string;
  qty: number;
  productSlug: string;
  productName: string;
  variantLabel: string | null;
  unitPriceCents: number;
  imageUrl?: string;
};

export function CartItemRow(p: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function set(qty: number) {
    start(async () => {
      await updateCartItem({ itemId: p.id, qty });
      router.refresh();
    });
  }

  return (
    <div className={`glass-card rounded-2xl p-4 flex gap-4 ${pending ? "opacity-60" : ""}`}>
      <Link href={`/loja/${p.productSlug}`} className="relative w-20 h-20 rounded-xl overflow-hidden bg-pink-50 shrink-0">
        {p.imageUrl ? (
          <Image src={p.imageUrl} alt={p.productName} fill className="object-cover" sizes="80px" />
        ) : null}
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/loja/${p.productSlug}`} className="font-medium hover:text-[color:var(--pink-600)]">
          {p.productName}
        </Link>
        {p.variantLabel ? (
          <p className="text-sm text-[color:var(--foreground)]/65">{p.variantLabel}</p>
        ) : null}
        <p className="text-sm text-[color:var(--pink-600)] mt-1">{formatBRL(p.unitPriceCents)} cada</p>

        <div className="mt-2 flex items-center gap-3">
          <div className="inline-flex items-center rounded-full bg-white/80 border border-white">
            <button className="w-8 h-8" onClick={() => set(Math.max(0, p.qty - 1))}>−</button>
            <span className="w-8 text-center">{p.qty}</span>
            <button className="w-8 h-8" onClick={() => set(p.qty + 1)}>+</button>
          </div>
          <button
            className="text-sm text-[color:var(--foreground)]/60 hover:text-[color:var(--pink-600)]"
            onClick={() =>
              start(async () => {
                await removeCartItem(p.id);
                router.refresh();
              })
            }
          >
            Remover
          </button>
        </div>
      </div>
      <div className="text-right font-semibold text-[color:var(--pink-600)]">
        {formatBRL(p.unitPriceCents * p.qty)}
      </div>
    </div>
  );
}

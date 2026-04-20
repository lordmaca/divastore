"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleCoupon } from "@/lib/coupon-actions";

export function ToggleCouponButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await toggleCoupon(id);
          router.refresh();
        })
      }
      className={`rounded-full text-xs font-medium px-3 py-1 ${
        active
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
          : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
      } disabled:opacity-50`}
    >
      {pending ? "..." : active ? "Ativo" : "Inativo"}
    </button>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReview } from "@/lib/review-admin-actions";

export function DeleteReviewButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("Excluir esta avaliação?")) return;
        start(async () => {
          await deleteReview(id);
          router.refresh();
        });
      }}
      className="rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 text-xs font-medium px-3 py-1"
    >
      {pending ? "..." : "Excluir"}
    </button>
  );
}

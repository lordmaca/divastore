"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReviewStatus, deleteReview } from "@/lib/review-admin-actions";
import { ReviewStatus } from "@/lib/generated/prisma/enums";

export function ReviewStatusButtons({
  id,
  current,
}: {
  id: string;
  current: ReviewStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<void>) {
    start(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      {current === ReviewStatus.HIDDEN ? (
        <button
          disabled={pending}
          onClick={() => run(() => setReviewStatus(id, ReviewStatus.PUBLISHED))}
          className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 text-xs font-medium px-3 py-1"
        >
          Publicar
        </button>
      ) : (
        <button
          disabled={pending}
          onClick={() => run(() => setReviewStatus(id, ReviewStatus.HIDDEN))}
          className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 text-xs font-medium px-3 py-1"
        >
          Esconder
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Excluir essa avaliação? Ação irreversível.")) return;
          run(() => deleteReview(id));
        }}
        className="rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 text-xs font-medium px-3 py-1"
      >
        Excluir
      </button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryPublishOrder, clearTinyMappingForOrder } from "@/lib/admin-actions";

export function RetryPublishButton({
  orderId,
  alreadyPublished,
  paid,
}: {
  orderId: string;
  alreadyPublished: boolean;
  paid: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!paid) {
    return <span className="text-xs text-[color:var(--foreground)]/55">aguarda pagamento</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              if (alreadyPublished) {
                await clearTinyMappingForOrder(orderId);
              }
              await retryPublishOrder(orderId);
              router.refresh();
            } catch (e) {
              alert(e instanceof Error ? e.message : "Falha ao publicar");
            }
          })
        }
        className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] disabled:opacity-50 text-white text-xs font-medium px-3 py-1"
      >
        {pending ? "..." : alreadyPublished ? "Republicar" : "Publicar no Tiny"}
      </button>
    </div>
  );
}

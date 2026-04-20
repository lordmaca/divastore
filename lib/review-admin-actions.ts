"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ReviewStatus } from "@/lib/generated/prisma/enums";

export async function deleteReview(id: string) {
  await requireAdmin();
  const r = await prisma.review.delete({
    where: { id },
    include: { product: { select: { slug: true } } },
  });
  revalidatePath("/admin/avaliacoes");
  revalidatePath(`/loja/${r.product.slug}`);
}

export async function setReviewStatus(id: string, status: ReviewStatus) {
  await requireAdmin();
  const r = await prisma.review.update({
    where: { id },
    data: { status },
    include: { product: { select: { slug: true } } },
  });
  revalidatePath("/admin/avaliacoes");
  revalidatePath(`/loja/${r.product.slug}`);
}

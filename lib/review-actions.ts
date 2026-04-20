"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/admin";
import { customerEligibleToReview } from "@/lib/reviews";

const schema = z.object({
  productId: z.string().min(1),
  productSlug: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
});

export async function submitReview(input: z.infer<typeof schema>) {
  const session = await requireCustomer();
  const parsed = schema.parse(input);
  const elig = await customerEligibleToReview(parsed.productId, session.user.id);
  if (!elig.eligible) {
    throw new Error(
      elig.reason === "already_reviewed"
        ? "Você já avaliou este produto."
        : "Só é possível avaliar depois que o pedido for entregue.",
    );
  }

  await prisma.review.create({
    data: {
      productId: parsed.productId,
      customerId: session.user.id,
      rating: parsed.rating,
      body: parsed.body?.trim() || null,
    },
  });

  revalidatePath(`/loja/${parsed.productSlug}`);
}

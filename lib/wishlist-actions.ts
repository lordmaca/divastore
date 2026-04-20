"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/admin";

const schema = z.object({ productId: z.string().min(1) });

export async function toggleWishlist(input: z.infer<typeof schema>) {
  const session = await requireCustomer();
  const { productId } = schema.parse(input);

  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId: session.user.id, productId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    revalidatePath("/minha-conta/favoritos");
    return { liked: false };
  }
  await prisma.wishlistItem.create({
    data: { customerId: session.user.id, productId },
  });
  revalidatePath("/minha-conta/favoritos");
  return { liked: true };
}

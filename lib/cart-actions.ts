"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureCartWritable } from "@/lib/cart";

const addSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(99),
});

export async function addToCart(input: z.infer<typeof addSchema>) {
  const { variantId, qty } = addSchema.parse(input);
  const cart = await ensureCartWritable();

  const variant = await prisma.variant.findUnique({ where: { id: variantId } });
  if (!variant) throw new Error("Variante não encontrada.");
  if (variant.stock < qty) throw new Error("Estoque insuficiente.");

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: { cartId: cart.id, variantId, qty },
    update: { qty: { increment: qty } },
  });

  revalidatePath("/carrinho");
}

// Returns true if the given cartItemId belongs to the caller's current cart.
// Anonymous-cart cookie or logged-in customer scope, both checked.
async function ownsCartItem(itemId: string): Promise<boolean> {
  const cart = await ensureCartWritable();
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    select: { cartId: true },
  });
  return Boolean(item && item.cartId === cart.id);
}

const updateSchema = z.object({
  itemId: z.string().min(1),
  qty: z.number().int().min(0).max(99),
});

export async function updateCartItem(input: z.infer<typeof updateSchema>) {
  const { itemId, qty } = updateSchema.parse(input);
  if (!(await ownsCartItem(itemId))) throw new Error("Item não encontrado.");
  if (qty === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
  } else {
    await prisma.cartItem.update({ where: { id: itemId }, data: { qty } });
  }
  revalidatePath("/carrinho");
}

export async function removeCartItem(itemId: string) {
  if (!(await ownsCartItem(itemId))) throw new Error("Item não encontrado.");
  await prisma.cartItem.delete({ where: { id: itemId } });
  revalidatePath("/carrinho");
}

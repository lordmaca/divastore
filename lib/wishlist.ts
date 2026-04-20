import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function getWishlistProductIdsForCustomer(
  customerId: string | null | undefined,
): Promise<Set<string>> {
  if (!customerId) return new Set();
  const items = await prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
  });
  return new Set(items.map((i) => i.productId));
}

// Convenience wrapper for callers that have not already loaded the session.
// Prefer the *ForCustomer variant when the page already calls auth() so we
// don't pay for two session decodes per render.
export async function getWishlistProductIds(): Promise<Set<string>> {
  const session = await auth();
  return getWishlistProductIdsForCustomer(session?.user?.id);
}

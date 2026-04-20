import { prisma } from "@/lib/db";
import { OrderStatus, ReviewStatus } from "@/lib/generated/prisma/enums";

export async function getProductReviewSummary(productId: string) {
  const stats = await prisma.review.aggregate({
    where: { productId, status: ReviewStatus.PUBLISHED },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    avg: stats._avg.rating ?? null,
    count: stats._count._all,
  };
}

// Only customers whose order was DELIVERED can review. Earlier stages
// (PAID, PACKED, SHIPPED) are too early — the customer hasn't seen the
// product yet, so any rating would be premature.
export async function customerEligibleToReview(productId: string, customerId: string) {
  const existing = await prisma.review.findUnique({
    where: { productId_customerId: { productId, customerId } },
  });
  if (existing) return { eligible: false as const, reason: "already_reviewed" as const };

  const purchased = await prisma.orderItem.findFirst({
    where: {
      order: { customerId, status: OrderStatus.DELIVERED },
      variant: { productId },
    },
    select: { id: true },
  });
  if (!purchased) return { eligible: false as const, reason: "not_delivered" as const };
  return { eligible: true as const };
}

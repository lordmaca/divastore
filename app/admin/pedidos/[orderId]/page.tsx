import { requireAdmin } from "@/lib/admin";
import { OrderDetailView } from "@/components/admin/OrderDetailView";

export const dynamic = "force-dynamic";

// Full-page detail route. The admin list renders an intercepting modal
// variant on top of this so admins can manage orders without losing the
// list context; both surfaces share `<OrderDetailView>`.
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireAdmin();
  const { orderId } = await params;
  return (
    <div className="max-w-5xl">
      <OrderDetailView orderId={orderId} />
    </div>
  );
}

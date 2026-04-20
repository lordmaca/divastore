import { requireAdmin } from "@/lib/admin";
import { OrderDetailView } from "@/components/admin/OrderDetailView";
import { OrderDetailModal } from "@/components/admin/OrderDetailModal";

export const dynamic = "force-dynamic";

// Intercepting route: when the admin clicks a row on /admin/pedidos, Next
// renders this instead of pushing the full /admin/pedidos/[orderId] page.
// The URL still reflects /admin/pedidos/[orderId] so refresh / direct
// navigation / share-a-link all still work via the non-intercepted route.
export default async function AdminOrderDetailModalRoute({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireAdmin();
  const { orderId } = await params;
  return (
    <OrderDetailModal>
      <OrderDetailView orderId={orderId} showBackLink={false} />
    </OrderDetailModal>
  );
}

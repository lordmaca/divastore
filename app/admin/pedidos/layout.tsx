import type { ReactNode } from "react";

// Parallel-route layout: renders the normal page content in {children}
// and the intercepting-route modal overlay in {modal} on top of it.
// When the admin navigates directly to /admin/pedidos/[orderId] (bookmark,
// refresh, deep link) the interceptor is skipped and the full-page route
// at [orderId]/page.tsx renders instead.
export default function AdminPedidosLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}

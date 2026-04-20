import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { FULFILLED_ORDER_STATES } from "@/lib/orders";
import { csvCell } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const customers = await prisma.customer.findMany({
    include: {
      _count: { select: { orders: true } },
      orders: {
        where: { status: { in: FULFILLED_ORDER_STATES } },
        select: { totalCents: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const lines = [
    ["id", "email", "name", "role", "createdAt", "ordersTotal", "paidOrders", "totalSpentCents"]
      .map(csvCell)
      .join(","),
  ];
  for (const c of customers) {
    const spent = c.orders.reduce((a, o) => a + o.totalCents, 0);
    lines.push(
      [
        c.id,
        c.email,
        c.name ?? "",
        c.role,
        c.createdAt.toISOString(),
        c._count.orders,
        c.orders.length,
        spent,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

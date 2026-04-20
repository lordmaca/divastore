import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { csvCell } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const fromS = url.searchParams.get("from");
  const toS = url.searchParams.get("to");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const from = fromS ? new Date(fromS) : new Date(today.getTime() - 27 * 86_400_000);
  const toEx = toS ? new Date(new Date(toS).getTime() + 86_400_000) : new Date(today.getTime() + 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toEx.getTime())) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: from, lt: toEx },
      status: { in: ["PAID", "PACKED", "SHIPPED", "DELIVERED"] },
    },
    include: { customer: { select: { email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const lines: string[] = [
    ["numero", "createdAt", "status", "customerName", "customerEmail", "totalCents", "totalBRL", "tinyOrderId"]
      .map(csvCell)
      .join(","),
  ];
  for (const o of orders) {
    lines.push(
      [
        o.number,
        o.createdAt.toISOString(),
        o.status,
        o.customer?.name ?? "",
        o.customer?.email ?? "",
        o.totalCents,
        (o.totalCents / 100).toFixed(2),
        o.tinyOrderId ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const body = lines.join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendas-${from.toISOString().slice(0, 10)}-${(toS ?? today.toISOString().slice(0, 10))}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

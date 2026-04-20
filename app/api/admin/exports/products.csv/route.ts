import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { csvCell } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const products = await prisma.product.findMany({
    include: {
      variants: true,
      category: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const lines = [
    [
      "productId",
      "slug",
      "name",
      "active",
      "source",
      "externalId",
      "category",
      "sku",
      "variantName",
      "priceCents",
      "stock",
      "weightG",
    ]
      .map(csvCell)
      .join(","),
  ];
  for (const p of products) {
    for (const v of p.variants) {
      lines.push(
        [
          p.id,
          p.slug,
          p.name,
          p.active,
          p.source,
          p.externalId ?? "",
          p.category?.name ?? "",
          v.sku,
          v.name ?? "",
          v.priceCents,
          v.stock,
          v.weightG ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="produtos-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/generated/prisma/enums";

export type OrderSearchFilters = {
  // Free-text: matches order number, customer name, customer email, item SKU.
  q?: string;
  status?: OrderStatus[];
  paymentMethod?: PaymentMethod[];
  paymentStatus?: PaymentStatus[];
  // Boolean filters for operational workflows.
  hasTracking?: boolean;        // Order.trackingCode not null
  publishedToTiny?: boolean;    // Order.tinyOrderId not null
  // Date range on createdAt.
  from?: Date;
  to?: Date;
  // Soft-deleted orders are hidden by default. Opt-in to include them.
  includeDeleted?: boolean;
};

export type OrderSearchOptions = OrderSearchFilters & {
  page?: number;      // 1-based
  pageSize?: number;  // default 50, cap 200
  orderBy?: "createdAt_desc" | "createdAt_asc" | "total_desc";
};

// Build the Prisma `where` clause once so list + CSV export stay aligned.
export function buildOrderWhere(f: OrderSearchFilters): Prisma.OrderWhereInput {
  const AND: Prisma.OrderWhereInput[] = [];

  if (!f.includeDeleted) AND.push({ deletedAt: null });
  if (f.status?.length) AND.push({ status: { in: f.status } });
  if (f.paymentMethod?.length) AND.push({ lastPaymentMethod: { in: f.paymentMethod } });
  if (f.paymentStatus?.length) AND.push({ lastPaymentStatus: { in: f.paymentStatus } });
  if (f.hasTracking === true) AND.push({ trackingCode: { not: null } });
  if (f.hasTracking === false) AND.push({ trackingCode: null });
  if (f.publishedToTiny === true) AND.push({ tinyOrderId: { not: null } });
  if (f.publishedToTiny === false) AND.push({ tinyOrderId: null });
  if (f.from || f.to) {
    AND.push({
      createdAt: {
        ...(f.from ? { gte: f.from } : {}),
        ...(f.to ? { lte: f.to } : {}),
      },
    });
  }
  if (f.q && f.q.trim()) {
    const q = f.q.trim();
    const asNumber = Number(q.replace(/[^\d]/g, ""));
    const OR: Prisma.OrderWhereInput[] = [
      { customer: { is: { email: { contains: q, mode: "insensitive" } } } },
      { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
      { items: { some: { sku: { contains: q, mode: "insensitive" } } } },
      { items: { some: { nameSnapshot: { contains: q, mode: "insensitive" } } } },
    ];
    if (Number.isInteger(asNumber) && asNumber > 0) OR.push({ number: asNumber });
    AND.push({ OR });
  }

  return AND.length ? { AND } : {};
}

export async function searchOrders(opts: OrderSearchOptions) {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const where = buildOrderWhere(opts);

  const orderBy: Prisma.OrderOrderByWithRelationInput =
    opts.orderBy === "createdAt_asc"
      ? { createdAt: "asc" }
      : opts.orderBy === "total_desc"
        ? { totalCents: "desc" }
        : { createdAt: "desc" };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { email: true, name: true } },
        items: { select: { id: true } },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, number: true, serie: true },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Parses a URL search-params bag (from the admin list page's query string)
// into a structured OrderSearchOptions. Keeps the page a dumb renderer.
export function parseSearchParams(sp: {
  q?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  hasTracking?: string;
  publishedToTiny?: string;
  includeDeleted?: string;
  from?: string;
  to?: string;
  page?: string;
  orderBy?: string;
}): OrderSearchOptions {
  const list = (v?: string) =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const toBool = (v?: string) => (v === "true" ? true : v === "false" ? false : undefined);
  const toDate = (v?: string) => (v ? new Date(v) : undefined);

  const statusList = list(sp.status)?.filter((v): v is OrderStatus =>
    Object.values(OrderStatus).includes(v as OrderStatus),
  );
  const methodList = list(sp.paymentMethod)?.filter((v): v is PaymentMethod =>
    Object.values(PaymentMethod).includes(v as PaymentMethod),
  );
  const payStatusList = list(sp.paymentStatus)?.filter((v): v is PaymentStatus =>
    Object.values(PaymentStatus).includes(v as PaymentStatus),
  );

  return {
    q: sp.q,
    status: statusList,
    paymentMethod: methodList,
    paymentStatus: payStatusList,
    hasTracking: toBool(sp.hasTracking),
    publishedToTiny: toBool(sp.publishedToTiny),
    includeDeleted: toBool(sp.includeDeleted) ?? false,
    from: toDate(sp.from),
    to: toDate(sp.to),
    page: sp.page ? Math.max(1, Number(sp.page)) : 1,
    orderBy:
      sp.orderBy === "createdAt_asc" || sp.orderBy === "total_desc"
        ? sp.orderBy
        : "createdAt_desc",
  };
}

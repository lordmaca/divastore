import { prisma } from "@/lib/db";
import { CouponForm } from "@/components/admin/CouponForm";
import { ToggleCouponButton } from "@/components/admin/ToggleCouponButton";
import { formatBRL } from "@/lib/money";
import { CouponType } from "@/lib/generated/prisma/enums";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  await requireAdmin();
  const [coupons, usage] = await Promise.all([
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }),
    // Orders that actually used each coupon (completed or any status — admin
    // sees the full picture). Sum discount given and count orders.
    prisma.order.groupBy({
      by: ["couponCode"],
      where: { couponCode: { not: null } },
      _count: { _all: true },
      _sum: { discountCents: true },
    }),
  ]);

  const usageByCode = new Map(
    usage.map((u) => [u.couponCode ?? "", { orders: u._count._all, discountCents: u._sum.discountCents ?? 0 }]),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Cupons</h1>
      <CouponForm />

      {coupons.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Nenhum cupom criado ainda.
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/40 text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Mín.</th>
                <th className="px-4 py-3">Usos</th>
                <th className="px-4 py-3">Pedidos aplicados</th>
                <th className="px-4 py-3">Desconto total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const u = usageByCode.get(c.code);
                return (
                  <tr key={c.id} className="border-t border-white/50">
                    <td className="px-4 py-3 font-mono">{c.code}</td>
                    <td className="px-4 py-3">{c.type === CouponType.PERCENT ? "% off" : "R$ off"}</td>
                    <td className="px-4 py-3">
                      {c.type === CouponType.PERCENT ? `${c.value}%` : formatBRL(c.value)}
                    </td>
                    <td className="px-4 py-3">{formatBRL(c.minSubtotalCents)}</td>
                    <td className="px-4 py-3">
                      {c.usedCount}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                    </td>
                    <td className="px-4 py-3">{u?.orders ?? 0}</td>
                    <td className="px-4 py-3 text-emerald-700">
                      {u ? `−${formatBRL(u.discountCents)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ToggleCouponButton id={c.id} active={c.active} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { OrderRow } from "@/components/admin/OrderRow";
import { searchOrders, parseSearchParams } from "@/lib/orders/search";
import { OrderStatus, PaymentMethod } from "@/lib/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const opts = parseSearchParams(sp);
  const { rows, total, page, pageSize, totalPages } = await searchOrders(opts);

  const selectedStatuses = new Set(opts.status ?? []);
  const selectedMethods = new Set(opts.paymentMethod ?? []);

  // Build a query-string preserver for pagination links.
  const qs = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { ...sp, ...overrides };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== "") u.set(k, v);
    }
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Pedidos</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">
            {total} pedido{total === 1 ? "" : "s"} — página {page} de {totalPages}
          </p>
        </div>
      </div>

      {/* Search + filters */}
      <form method="get" className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={opts.q ?? ""}
            placeholder="Buscar por número, cliente, SKU…"
            className="flex-1 min-w-0 rounded-xl bg-white/80 border border-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300"
          />
          <button
            type="submit"
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4"
          >
            Buscar
          </button>
          {Object.keys(sp).length > 0 ? (
            <Link
              href="/admin/pedidos"
              className="rounded-full bg-white/70 hover:bg-white text-xs text-[color:var(--foreground)]/70 px-3 py-2 border border-white"
            >
              Limpar
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[color:var(--foreground)]/60 mr-1">Status:</span>
          {Object.values(OrderStatus).map((s) => {
            const active = selectedStatuses.has(s);
            const next = new Set(selectedStatuses);
            if (active) next.delete(s);
            else next.add(s);
            return (
              <Link
                key={s}
                href={`/admin/pedidos${qs({ status: [...next].join(","), page: undefined })}`}
                className={`rounded-full px-2.5 py-0.5 border ${
                  active
                    ? "bg-[color:var(--pink-500)] text-white border-transparent"
                    : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
                }`}
              >
                {s}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[color:var(--foreground)]/60 mr-1">Método:</span>
          {Object.values(PaymentMethod).map((m) => {
            const active = selectedMethods.has(m);
            const next = new Set(selectedMethods);
            if (active) next.delete(m);
            else next.add(m);
            return (
              <Link
                key={m}
                href={`/admin/pedidos${qs({ paymentMethod: [...next].join(","), page: undefined })}`}
                className={`rounded-full px-2.5 py-0.5 border ${
                  active
                    ? "bg-[color:var(--pink-500)] text-white border-transparent"
                    : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
                }`}
              >
                {m}
              </Link>
            );
          })}
          <span className="ml-2 text-[color:var(--foreground)]/60">·</span>
          <Link
            href={`/admin/pedidos${qs({
              hasTracking: opts.hasTracking === true ? undefined : "true",
              page: undefined,
            })}`}
            className={`rounded-full px-2.5 py-0.5 border ${
              opts.hasTracking === true
                ? "bg-[color:var(--pink-500)] text-white border-transparent"
                : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
            }`}
          >
            com rastreio
          </Link>
          <Link
            href={`/admin/pedidos${qs({
              publishedToTiny: opts.publishedToTiny === false ? undefined : "false",
              page: undefined,
            })}`}
            className={`rounded-full px-2.5 py-0.5 border ${
              opts.publishedToTiny === false
                ? "bg-[color:var(--pink-500)] text-white border-transparent"
                : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
            }`}
          >
            não publicado no Tiny
          </Link>
          <Link
            href={`/admin/pedidos${qs({
              includeDeleted: opts.includeDeleted ? undefined : "true",
              page: undefined,
            })}`}
            className={`rounded-full px-2.5 py-0.5 border ${
              opts.includeDeleted
                ? "bg-red-600 text-white border-transparent"
                : "bg-white/70 text-[color:var(--foreground)]/70 border-white"
            }`}
          >
            incluir excluídos
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Nenhum pedido corresponde aos filtros.
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/40 text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
              <tr>
                <th className="px-3 py-3">Nº</th>
                <th className="px-3 py-3">Cliente</th>
                <th className="px-3 py-3">Itens</th>
                <th className="px-3 py-3">Total</th>
                <th className="px-3 py-3">Pagamento</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Tiny</th>
                <th className="px-3 py-3">NF-e</th>
                <th className="px-3 py-3">Rastreio</th>
                <th className="px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  invoice={o.invoices[0] ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--foreground)]/60">
            Exibindo {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/admin/pedidos${qs({ page: String(page - 1) })}`}
                className="rounded-full bg-white/70 hover:bg-white px-3 py-1 border border-white"
              >
                ← Anterior
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/admin/pedidos${qs({ page: String(page + 1) })}`}
                className="rounded-full bg-white/70 hover:bg-white px-3 py-1 border border-white"
              >
                Próxima →
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

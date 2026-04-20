import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { FULFILLED_ORDER_STATES } from "@/lib/orders";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
          { cpf: { contains: q } },
        ],
      }
    : {};

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        _count: { select: { orders: true } },
        orders: {
          where: { status: { in: FULFILLED_ORDER_STATES } },
          select: { totalCents: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Clientes</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">{total.toLocaleString("pt-BR")} cadastrados</p>
        </div>
        <Link
          href="/api/admin/exports/customers.csv"
          className="rounded-full bg-white/70 hover:bg-white text-sm font-medium px-4 py-2 border border-white"
        >
          Exportar CSV
        </Link>
      </div>

      <form className="glass-card rounded-2xl p-4 grid sm:grid-cols-3 gap-3 items-end" action="/admin/clientes">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por e-mail, nome ou CPF…"
          className="rounded-xl bg-white/80 border border-white px-3 py-2 text-sm sm:col-span-2"
        />
        <button className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4 py-2">
          Buscar
        </button>
      </form>

      {customers.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Nenhum cliente encontrado.
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/40 text-left text-xs uppercase tracking-wide text-[color:var(--foreground)]/65">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Pedidos</th>
                <th className="px-4 py-3">Gasto total</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const spent = c.orders.reduce((a, o) => a + o.totalCents, 0);
                return (
                  <tr key={c.id} className="border-t border-white/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name ?? "—"}</div>
                      <div className="text-xs text-[color:var(--foreground)]/60">{c.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                          c.role === "ADMIN" ? "bg-violet-100 text-violet-800" : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {c.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">{c._count.orders}</td>
                    <td className="px-4 py-3 font-semibold text-[color:var(--pink-600)]">{formatBRL(spent)}</td>
                    <td className="px-4 py-3 text-xs">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/clientes/${c.id}`} className="text-[color:var(--pink-600)] hover:underline text-sm">
                        ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between text-sm">
          <PageLink page={pageNum - 1} disabled={pageNum <= 1} q={q}>← anterior</PageLink>
          <span className="text-[color:var(--foreground)]/65">página {pageNum} de {pages}</span>
          <PageLink page={pageNum + 1} disabled={pageNum >= pages} q={q}>próxima →</PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({ page, disabled, q, children }: { page: number; disabled?: boolean; q?: string; children: React.ReactNode }) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  sp.set("page", page.toString());
  if (disabled) return <span className="text-[color:var(--foreground)]/40">{children}</span>;
  return <Link href={`/admin/clientes?${sp.toString()}`} className="text-[color:var(--pink-600)] hover:underline">{children}</Link>;
}

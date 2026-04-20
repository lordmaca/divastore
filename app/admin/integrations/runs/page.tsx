import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ adapter?: string; status?: string; page?: string }>;
}) {
  const { adapter, status, page } = await searchParams;
  const pageNum = Math.max(1, Number(page ?? 1));

  const where = {
    ...(adapter ? { adapter } : {}),
    ...(status ? { status } : {}),
  };

  const [runs, total, adapterList, statusList] = await Promise.all([
    prisma.integrationRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.integrationRun.count({ where }),
    prisma.integrationRun
      .findMany({ distinct: ["adapter"], select: { adapter: true } })
      .then((rs) => rs.map((r) => r.adapter).sort()),
    prisma.integrationRun
      .findMany({ distinct: ["status"], select: { status: true } })
      .then((rs) => rs.map((r) => r.status).sort()),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Execuções de integração</h1>
          <p className="text-sm text-[color:var(--foreground)]/70">{total.toLocaleString("pt-BR")} registros</p>
        </div>
        <Link
          href="/admin/integrations"
          className="rounded-full bg-white/70 hover:bg-white text-sm font-medium px-4 py-2 border border-white"
        >
          ← Integrations
        </Link>
      </div>

      <form className="glass-card rounded-2xl p-4 grid sm:grid-cols-3 gap-3 items-end" action="/admin/integrations/runs">
        <label className="text-sm block">
          <span>Adaptador</span>
          <select name="adapter" defaultValue={adapter ?? ""} className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2">
            <option value="">todos</option>
            {adapterList.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm block">
          <span>Status</span>
          <select name="status" defaultValue={status ?? ""} className="mt-1 w-full rounded-xl bg-white/80 border border-white px-3 py-2">
            <option value="">todos</option>
            {statusList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white text-sm font-medium px-4 py-2">
          Aplicar
        </button>
      </form>

      {runs.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-[color:var(--foreground)]/70">
          Nenhuma execução nesse filtro.
        </div>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.id} className="glass-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs text-[color:var(--foreground)]/55">
                    {new Date(r.createdAt).toLocaleString("pt-BR")}
                    {r.durationMs != null ? ` · ${r.durationMs}ms` : ""}
                  </p>
                  <p className="font-mono text-sm mt-0.5">
                    {r.adapter} · {r.operation}
                  </p>
                  {r.error ? (
                    <p className="mt-1 text-xs text-red-700 break-words">{r.error}</p>
                  ) : null}
                </div>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                    r.status === "ok" || r.status === "test_ok"
                      ? "bg-emerald-100 text-emerald-800"
                      : r.status === "stub_ok"
                        ? "bg-pink-100 text-pink-800"
                        : r.status === "error" || r.status === "test_error"
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              {r.payload ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[color:var(--foreground)]/65 hover:text-[color:var(--pink-600)]">
                    payload
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-[10px] font-mono bg-white/70 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between">
          <PageLink page={pageNum - 1} disabled={pageNum <= 1} adapter={adapter} status={status}>
            ← anterior
          </PageLink>
          <span className="text-sm text-[color:var(--foreground)]/65">
            página {pageNum} de {pages}
          </span>
          <PageLink page={pageNum + 1} disabled={pageNum >= pages} adapter={adapter} status={status}>
            próxima →
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  adapter,
  status,
  children,
}: {
  page: number;
  disabled?: boolean;
  adapter?: string;
  status?: string;
  children: React.ReactNode;
}) {
  const sp = new URLSearchParams();
  if (adapter) sp.set("adapter", adapter);
  if (status) sp.set("status", status);
  sp.set("page", page.toString());
  if (disabled) {
    return <span className="text-sm text-[color:var(--foreground)]/40">{children}</span>;
  }
  return (
    <Link href={`/admin/integrations/runs?${sp.toString()}`} className="text-sm text-[color:var(--pink-600)] hover:underline">
      {children}
    </Link>
  );
}

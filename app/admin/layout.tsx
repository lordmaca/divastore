import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-white/60 bg-white/55 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <Link href="/admin" className="font-display text-xl text-[color:var(--pink-600)]">
            Brilho de Diva · Admin
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-[color:var(--foreground)]/70 hover:text-[color:var(--pink-600)]">
              ↗ Loja
            </Link>
            <span className="text-[color:var(--foreground)]/65">{session.user.email}</span>
            <form action={logout}>
              <button className="text-sm text-[color:var(--foreground)]/70 hover:text-[color:var(--pink-600)]">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex-1 mx-auto max-w-7xl w-full px-6 py-8 grid grid-cols-[200px_1fr] gap-8">
        <nav className="space-y-1 text-sm">
          <AdminLink href="/admin">Visão geral</AdminLink>
          <AdminLink href="/admin/produtos">Produtos</AdminLink>
          <AdminLink href="/admin/pedidos">Pedidos</AdminLink>
          <AdminLink href="/admin/clientes">Clientes</AdminLink>
          <AdminLink href="/admin/cupons">Cupons</AdminLink>
          <AdminLink href="/admin/avaliacoes">Avaliações</AdminLink>
          <AdminLink href="/admin/integrations">Integration Center</AdminLink>
          <AdminLink href="/admin/configuracoes">Configurações</AdminLink>
          <p className="px-3 pt-4 pb-1 text-xs uppercase tracking-wide text-[color:var(--foreground)]/55">
            Relatórios
          </p>
          <AdminLink href="/admin/relatorios/vendas">Vendas</AdminLink>
          <AdminLink href="/admin/relatorios/clientes">Clientes</AdminLink>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2 hover:bg-white/60 hover:text-[color:var(--pink-600)]"
    >
      {children}
    </Link>
  );
}

import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MinhaContaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/minha-conta");

  const customer = await prisma.customer.findUnique({
    where: { id: session.user.id },
    select: { cpf: true, phone: true },
  });
  const profileIncomplete = !customer?.cpf;

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-[color:var(--pink-600)] mb-2">
        Olá, {session.user.name?.split(" ")[0] ?? "Diva"}
      </h1>
      <p className="text-[color:var(--foreground)]/70 mb-8">{session.user.email}</p>

      {profileIncomplete ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 mb-6 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-900">
            <strong>Complete seu perfil:</strong> adicione seu CPF para receber nota fiscal nos próximos pedidos.
          </p>
          <Link
            href="/minha-conta/perfil"
            className="shrink-0 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium px-3 py-1.5"
          >
            Atualizar
          </Link>
        </div>
      ) : null}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/minha-conta/pedidos" className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform">
          <p className="font-medium">Meus pedidos</p>
          <p className="text-sm text-[color:var(--foreground)]/65 mt-1">Acompanhe e revise pedidos.</p>
        </Link>
        <Link href="/minha-conta/favoritos" className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform">
          <p className="font-medium">Meus favoritos</p>
          <p className="text-sm text-[color:var(--foreground)]/65 mt-1">Produtos que você salvou.</p>
        </Link>
        <Link href="/minha-conta/perfil" className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform">
          <p className="font-medium">Meu perfil</p>
          <p className="text-sm text-[color:var(--foreground)]/65 mt-1">
            Dados pessoais, senha e preferências.
          </p>
        </Link>
        <Link href="/minha-conta/enderecos" className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform">
          <p className="font-medium">Meus endereços</p>
          <p className="text-sm text-[color:var(--foreground)]/65 mt-1">
            Gerencie endereços salvos para checkout rápido.
          </p>
        </Link>
        <Link href="/loja" className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform">
          <p className="font-medium">Continuar comprando</p>
          <p className="text-sm text-[color:var(--foreground)]/65 mt-1">Volte para a coleção.</p>
        </Link>
      </div>

      <form action={logout} className="mt-8">
        <button className="text-sm text-[color:var(--foreground)]/70 hover:text-[color:var(--pink-600)]">
          Sair da conta
        </button>
      </form>
    </main>
  );
}

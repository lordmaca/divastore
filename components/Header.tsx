import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCartReadOnly, cartTotals } from "@/lib/cart";
import { AdminMenu } from "@/components/AdminMenu";
import { Role } from "@/lib/generated/prisma/enums";
import { getNavCategories } from "@/lib/catalog/navigation";

export async function Header() {
  const session = await auth();
  const [cart, navCategories] = await Promise.all([
    getCartReadOnly(session?.user?.id ?? null),
    getNavCategories(),
  ]);
  const { itemCount } = cartTotals(cart);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/55 border-b border-white/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="font-display text-2xl text-[color:var(--pink-600)]">
          Brilho de Diva
        </Link>

        <nav className="hidden sm:flex gap-6 text-sm font-medium text-[color:var(--foreground)]/80">
          <Link href="/loja" className="hover:text-[color:var(--pink-600)]">
            Loja
          </Link>
          {navCategories.map((c) => (
            <Link key={c.slug} href={c.href} className="hover:text-[color:var(--pink-600)]">
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4 text-sm">
          {session?.user ? (
            <Link href="/minha-conta" className="hover:text-[color:var(--pink-600)]">
              Olá, {session.user.name?.split(" ")[0] ?? "Diva"}
            </Link>
          ) : (
            <Link href="/login" className="hover:text-[color:var(--pink-600)]">
              Entrar
            </Link>
          )}

          {session?.user?.role === Role.ADMIN ? <AdminMenu /> : null}

          <Link
            href="/carrinho"
            className="relative inline-flex items-center gap-2 rounded-full bg-[color:var(--pink-500)] px-4 py-2 text-white hover:bg-[color:var(--pink-600)] transition-colors"
          >
            <span aria-hidden>🛍</span>
            <span>Carrinho</span>
            {itemCount > 0 ? (
              <span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-white text-[color:var(--pink-600)] text-xs font-semibold px-1">
                {itemCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}

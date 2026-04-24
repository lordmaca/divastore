import Link from "next/link";
import { getNavCategories } from "@/lib/catalog/navigation";
import { getSetting } from "@/lib/settings";

export async function Footer() {
  const [navCategories, about] = await Promise.all([
    getNavCategories(),
    getSetting("about.page"),
  ]);
  return (
    <footer className="mt-16 border-t border-white/60 bg-white/35 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-display text-2xl text-[color:var(--pink-600)]">Brilho de Diva</p>
          <p className="mt-2 text-[color:var(--foreground)]/75">
            Realce sua Beleza, Brilhe como uma Diva!
          </p>
          {about.enabled ? (
            <p className="mt-3">
              <Link
                href="/sobre"
                className="text-[color:var(--pink-600)] hover:underline font-medium"
              >
                Sobre nós →
              </Link>
            </p>
          ) : null}
        </div>
        <div>
          <p className="font-semibold mb-2">Loja</p>
          <ul className="space-y-1 text-[color:var(--foreground)]/75">
            <li><Link href="/loja">Tudo</Link></li>
            {navCategories.map((c) => (
              <li key={c.slug}><Link href={c.href}>{c.name}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold mb-2">Atendimento</p>
          <ul className="space-y-1 text-[color:var(--foreground)]/75">
            {about.enabled ? <li><Link href="/sobre">Sobre nós</Link></li> : null}
            <li><Link href="/minha-conta/pedidos">Meus pedidos</Link></li>
            {about.contact.email ? (
              <li>
                <a href={`mailto:${about.contact.email}`}>{about.contact.email}</a>
              </li>
            ) : (
              <li>contato@brilhodediva.com.br</li>
            )}
          </ul>
        </div>
      </div>
      <div className="text-center text-xs text-[color:var(--foreground)]/60 pb-6">
        © {new Date().getFullYear()} Brilho de Diva. Todos os direitos reservados.
      </div>
    </footer>
  );
}

import Link from "next/link";
import { getNavCategories } from "@/lib/catalog/navigation";

export async function Footer() {
  const navCategories = await getNavCategories();
  return (
    <footer className="mt-16 border-t border-white/60 bg-white/35 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-display text-2xl text-[color:var(--pink-600)]">Brilho de Diva</p>
          <p className="mt-2 text-[color:var(--foreground)]/75">
            Realce sua Beleza, Brilhe como uma Diva!
          </p>
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
            <li>WhatsApp em breve</li>
            <li><Link href="/minha-conta/pedidos">Meus pedidos</Link></li>
            <li>contato@brilhodediva.com.br</li>
          </ul>
        </div>
      </div>
      <div className="text-center text-xs text-[color:var(--foreground)]/60 pb-6">
        © {new Date().getFullYear()} Brilho de Diva. Todos os direitos reservados.
      </div>
    </footer>
  );
}

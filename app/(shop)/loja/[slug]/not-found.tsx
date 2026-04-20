import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="glass-card rounded-3xl p-10 text-center">
        <p className="font-display text-5xl text-[color:var(--pink-600)]">404</p>
        <h1 className="mt-2 text-xl font-medium">Produto não encontrado</h1>
        <p className="mt-3 text-[color:var(--foreground)]/70">
          Esse produto pode ter sido removido ou está temporariamente fora do catálogo.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/loja"
            className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
          >
            Ver coleção
          </Link>
          <Link
            href="/"
            className="rounded-full bg-white/70 hover:bg-white text-[color:var(--pink-600)] font-medium px-6 py-3 border border-white"
          >
            Início
          </Link>
        </div>
      </div>
    </main>
  );
}

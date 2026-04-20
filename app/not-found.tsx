import Link from "next/link";
import { Sparkle } from "@/components/Sparkle";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="relative w-full max-w-xl">
        <Sparkle className="absolute -top-4 left-4 text-pink-200" size={24} delay="0s" />
        <Sparkle className="absolute bottom-2 right-6 text-pink-400" size={18} delay="0.8s" />
        <div className="glass-card rounded-3xl p-12 text-center">
          <p className="font-display text-6xl text-[color:var(--pink-600)]">404</p>
          <h1 className="mt-2 text-xl font-medium">Página não encontrada</h1>
          <p className="mt-3 text-[color:var(--foreground)]/70">
            O brilho que você procura sumiu. Vamos te levar de volta para a coleção?
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/loja"
              className="rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
            >
              Explorar a loja
            </Link>
            <Link
              href="/"
              className="rounded-full bg-white/70 hover:bg-white text-[color:var(--pink-600)] font-medium px-6 py-3 border border-white"
            >
              Ir para o início
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

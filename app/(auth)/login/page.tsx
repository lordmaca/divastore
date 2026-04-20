import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { rateLimit, getClientIp, safeNext } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  async function action(formData: FormData) {
    "use server";
    const ip = getClientIp(await headers());
    // 8 attempts per IP per 5 minutes (refill ~1.6/min).
    const rl = rateLimit(`login:${ip}`, { capacity: 8, refillPerSecond: 8 / 300 });
    if (!rl.ok) {
      redirect(`/login?error=rate${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }

    const parsed = loginSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }
    const target = safeNext(next, "/minha-conta");
    try {
      await signIn("credentials", { ...parsed.data, redirectTo: target });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fail";
      if (msg.includes("NEXT_REDIRECT")) throw err;
      redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-3xl p-8">
        <h1 className="font-display text-3xl text-[color:var(--pink-600)] text-center">Entrar</h1>
        <p className="mt-2 text-center text-sm text-[color:var(--foreground)]/70">
          Acesse sua conta para acompanhar pedidos e finalizar a compra.
        </p>

        {error === "rate" ? (
          <p className="mt-4 text-sm text-red-600 text-center">
            Muitas tentativas. Aguarde alguns minutos e tente novamente.
          </p>
        ) : error ? (
          <p className="mt-4 text-sm text-red-600 text-center">
            E-mail ou senha incorretos.
          </p>
        ) : null}

        <form action={action} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">E-mail</span>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Senha</span>
            <input
              required
              type="password"
              name="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
          >
            Entrar
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/recuperar-senha" className="text-[color:var(--pink-600)] hover:underline">
            Esqueci minha senha
          </Link>
        </p>

        <p className="mt-6 text-center text-sm">
          Ainda não tem conta?{" "}
          <Link href={`/cadastro${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-[color:var(--pink-600)] hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </main>
  );
}

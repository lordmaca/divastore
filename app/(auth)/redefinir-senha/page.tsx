import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { consumeResetToken, markUsed } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(6).max(200),
  confirm: z.string().min(6).max(200),
});

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="glass-card rounded-3xl p-8 text-center">
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Link inválido</h1>
          <p className="mt-4 text-sm text-[color:var(--foreground)]/75">
            Este link não é válido ou expirou. Solicite um novo.
          </p>
          <Link
            href="/recuperar-senha"
            className="mt-8 inline-block rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
          >
            Solicitar novo link
          </Link>
        </div>
      </main>
    );
  }

  const valid = await consumeResetToken(token);

  async function action(formData: FormData) {
    "use server";
    const h = await headers();
    const ip = getClientIp(h);
    const rl = rateLimit(`reset-confirm:${ip}`, { capacity: 5, refillPerSecond: 5 / 600 });
    if (!rl.ok) redirect(`/redefinir-senha?token=${token}&error=rate`);

    const parsed = schema.safeParse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
    if (!parsed.success) redirect(`/redefinir-senha?token=${token}&error=invalid`);
    if (parsed.data.password !== parsed.data.confirm) {
      redirect(`/redefinir-senha?token=${token}&error=mismatch`);
    }

    const target = await consumeResetToken(parsed.data.token);
    if (!target) redirect(`/redefinir-senha?error=expired`);

    const passwordHash = await hash(parsed.data.password, 10);
    const customer = await prisma.customer.update({
      where: { id: target.customerId },
      data: {
        passwordHash,
        // A guest account that sets a password becomes a full account.
        guest: false,
      },
      select: { email: true },
    });
    await markUsed(parsed.data.token);

    await signIn("credentials", {
      email: customer.email,
      password: parsed.data.password,
      redirectTo: "/minha-conta",
    });
  }

  if (!valid) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="glass-card rounded-3xl p-8 text-center">
          <h1 className="font-display text-3xl text-[color:var(--pink-600)]">
            Link expirado
          </h1>
          <p className="mt-4 text-sm text-[color:var(--foreground)]/75">
            Este link já foi usado ou expirou. Solicite um novo para continuar.
          </p>
          <Link
            href="/recuperar-senha"
            className="mt-8 inline-block rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
          >
            Solicitar novo link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-3xl p-8">
        <h1 className="font-display text-3xl text-[color:var(--pink-600)] text-center">
          Criar nova senha
        </h1>
        <p className="mt-2 text-center text-sm text-[color:var(--foreground)]/70">
          Escolha uma senha com pelo menos 6 caracteres.
        </p>

        {error === "rate" ? (
          <p className="mt-4 text-sm text-red-600 text-center">Muitas tentativas, aguarde.</p>
        ) : error === "invalid" ? (
          <p className="mt-4 text-sm text-red-600 text-center">Confira os dados informados.</p>
        ) : error === "mismatch" ? (
          <p className="mt-4 text-sm text-red-600 text-center">As senhas não coincidem.</p>
        ) : null}

        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <label className="block">
            <span className="text-sm font-medium">Nova senha</span>
            <input
              required
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={6}
              className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Confirmar senha</span>
            <input
              required
              type="password"
              name="confirm"
              autoComplete="new-password"
              minLength={6}
              className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
          >
            Salvar nova senha
          </button>
        </form>
      </div>
    </main>
  );
}

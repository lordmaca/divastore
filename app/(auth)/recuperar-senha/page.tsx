import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { NotificationChannel } from "@/lib/generated/prisma/enums";
import { sendSafe } from "@/lib/notifications/dispatch";
import { issueResetToken } from "@/lib/password-reset";
import { absoluteUrl } from "@/lib/notifications/templates/shared";

const schema = z.object({ email: z.string().email().max(254) });

export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  async function action(formData: FormData) {
    "use server";
    const h = await headers();
    const ip = getClientIp(h);
    // Per-IP: 6 req/10min. Per-email: 3 req/hour (defense against spam loops).
    const ipLimit = rateLimit(`reset:ip:${ip}`, { capacity: 6, refillPerSecond: 6 / 600 });
    if (!ipLimit.ok) redirect(`/recuperar-senha?error=rate`);

    const parsed = schema.safeParse({
      email: (formData.get("email") as string | null)?.toLowerCase().trim(),
    });
    if (!parsed.success) redirect(`/recuperar-senha?error=invalid`);

    const emailLimit = rateLimit(`reset:email:${parsed.data.email}`, {
      capacity: 3,
      refillPerSecond: 3 / 3600,
    });
    if (!emailLimit.ok) redirect(`/recuperar-senha?error=rate`);

    const customer = await prisma.customer.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, name: true, email: true },
    });

    // ALWAYS redirect to "sent" — never reveal whether an email is
    // registered (prevents enumeration).
    if (customer) {
      const { raw, expiresAt } = await issueResetToken(customer.id);
      const resetUrl = absoluteUrl(`/redefinir-senha?token=${raw}`);
      await sendSafe({
        channel: NotificationChannel.EMAIL,
        template: "password_reset",
        data: { customerName: customer.name, resetUrl, expiresAt },
        recipient: customer.email,
        customerId: customer.id,
      });
    }

    redirect(`/recuperar-senha?sent=1`);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-3xl p-8">
        <h1 className="font-display text-3xl text-[color:var(--pink-600)] text-center">
          Recuperar senha
        </h1>

        {sent ? (
          <>
            <p className="mt-6 text-sm text-[color:var(--foreground)]/80 text-center">
              Se encontrarmos uma conta com esse e-mail, enviaremos um link para redefinir a senha em alguns instantes.
            </p>
            <p className="mt-2 text-xs text-[color:var(--foreground)]/60 text-center">
              Confira também a caixa de spam. O link é válido por 1 hora.
            </p>
            <p className="mt-8 text-center text-sm">
              <Link href="/login" className="text-[color:var(--pink-600)] hover:underline">
                Voltar para o login
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-[color:var(--foreground)]/70">
              Informe seu e-mail e enviaremos um link para criar uma nova senha.
            </p>

            {error === "rate" ? (
              <p className="mt-4 text-sm text-red-600 text-center">
                Muitas tentativas. Aguarde alguns minutos.
              </p>
            ) : error === "invalid" ? (
              <p className="mt-4 text-sm text-red-600 text-center">E-mail inválido.</p>
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
              <button
                type="submit"
                className="w-full rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3"
              >
                Enviar link
              </button>
            </form>

            <p className="mt-6 text-center text-sm">
              Lembrou da senha?{" "}
              <Link href="/login" className="text-[color:var(--pink-600)] hover:underline">
                Entrar
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

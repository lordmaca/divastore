import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import { NotificationChannel } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { rateLimit, getClientIp, safeNext } from "@/lib/rate-limit";
import { sendSafe } from "@/lib/notifications/dispatch";

const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(6).max(200),
  marketingOptIn: z.coerce.boolean().optional().default(false),
  whatsappOptIn: z.coerce.boolean().optional().default(false),
});

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  async function action(formData: FormData) {
    "use server";
    const h = await headers();
    const ip = getClientIp(h);
    // Per-IP bucket: 5 signups per hour; per-email bucket: 3 attempts per day.
    // The email bucket blocks enumeration-by-spam regardless of IP rotation.
    const ipLimit = rateLimit(`cadastro:ip:${ip}`, { capacity: 5, refillPerSecond: 5 / 3600 });
    if (!ipLimit.ok) {
      redirect(`/cadastro?error=rate${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }

    const parsed = schema.safeParse({
      name: formData.get("name"),
      email: (formData.get("email") as string | null)?.toLowerCase().trim(),
      password: formData.get("password"),
      marketingOptIn: formData.get("marketingOptIn") === "on",
      whatsappOptIn: formData.get("whatsappOptIn") === "on",
    });
    if (!parsed.success) {
      redirect(`/cadastro?error=invalid${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }
    const { name, email, password, marketingOptIn, whatsappOptIn } = parsed.data;

    const emailLimit = rateLimit(`cadastro:email:${email}`, { capacity: 3, refillPerSecond: 3 / 86400 });
    if (!emailLimit.ok) {
      // Generic bounce — don't reveal whether the bucket was hit by the real
      // owner or an enumerator. Same message as the rate path.
      redirect(`/cadastro?error=rate${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }

    const passwordHash = await hash(password, 10);
    const now = new Date();
    let createdId: string | null = null;

    // Check if this email is already taken by a guest-checkout customer
    // (row exists but no passwordHash). If so, we "claim" that row — set
    // the passwordHash, name, and opt-ins — so their order history is
    // preserved. If the row has a passwordHash, signup must not overwrite
    // it (that would be account takeover); we fall back to the generic
    // anti-enumeration redirect.
    const existing = await prisma.customer.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (existing?.passwordHash) {
      redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }

    try {
      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name,
            passwordHash,
            marketingOptIn,
            marketingOptInAt: marketingOptIn ? now : null,
            whatsappOptIn,
            whatsappOptInAt: whatsappOptIn ? now : null,
          },
        });
        createdId = existing.id;
      } else {
        const created = await prisma.customer.create({
          data: {
            email,
            name,
            passwordHash,
            marketingOptIn,
            marketingOptInAt: marketingOptIn ? now : null,
            whatsappOptIn,
            whatsappOptInAt: whatsappOptIn ? now : null,
          },
          select: { id: true },
        });
        createdId = created.id;
      }
    } catch (err) {
      // Race: another request just claimed this email between the check
      // above and the insert. Same anti-enumeration redirect.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
      }
      throw err;
    }

    // Fire-and-forget welcome email. Never let a mail outage break signup.
    await sendSafe({
      channel: NotificationChannel.EMAIL,
      template: "welcome",
      data: { customerName: name },
      recipient: email,
      customerId: createdId,
    });

    const target = safeNext(next, "/minha-conta");
    await signIn("credentials", { email, password, redirectTo: target });
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-3xl p-8">
        <h1 className="font-display text-3xl text-[color:var(--pink-600)] text-center">Criar conta</h1>
        <p className="mt-2 text-center text-sm text-[color:var(--foreground)]/70">
          Vamos brilhar juntas, Diva.
        </p>

        {error === "rate" ? (
          <p className="mt-4 text-sm text-red-600 text-center">
            Muitas tentativas. Aguarde alguns minutos e tente novamente.
          </p>
        ) : error === "invalid" ? (
          <p className="mt-4 text-sm text-red-600 text-center">Confira os dados informados.</p>
        ) : null}

        <form action={action} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Nome</span>
            <input required name="name" className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">E-mail</span>
            <input required type="email" name="email" autoComplete="email" className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Senha (mín. 6)</span>
            <input required type="password" name="password" autoComplete="new-password" minLength={6} className="mt-1 w-full rounded-xl bg-white/80 border border-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-pink-300" />
          </label>

          <fieldset className="space-y-2 pt-2">
            <label className="flex items-start gap-2 text-sm text-[color:var(--foreground)]/80">
              <input type="checkbox" name="marketingOptIn" className="mt-1 accent-pink-500" />
              <span>Quero receber novidades, promoções e lançamentos por e-mail.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[color:var(--foreground)]/80">
              <input type="checkbox" name="whatsappOptIn" className="mt-1 accent-pink-500" />
              <span>Quero receber atualizações do meu pedido por WhatsApp.</span>
            </label>
          </fieldset>

          <button type="submit" className="w-full rounded-full bg-[color:var(--pink-500)] hover:bg-[color:var(--pink-600)] text-white font-medium px-6 py-3">
            Criar conta
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          Já tem conta?{" "}
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-[color:var(--pink-600)] hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}

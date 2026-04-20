import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProfileForm } from "@/components/account/ProfileForm";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/minha-conta/perfil");

  const customer = await prisma.customer.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      phone: true,
      cpf: true,
      marketingOptIn: true,
      whatsappOptIn: true,
    },
  });
  if (!customer) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-4xl text-[color:var(--pink-600)]">Meu perfil</h1>
        <Link href="/minha-conta" className="text-sm text-[color:var(--pink-600)] hover:underline">
          ← Minha conta
        </Link>
      </div>

      <ProfileForm
        defaults={{
          name: customer.name ?? "",
          email: customer.email,
          phone: customer.phone ?? "",
          cpf: customer.cpf ?? "",
          marketingOptIn: customer.marketingOptIn,
          whatsappOptIn: customer.whatsappOptIn,
        }}
      />
    </main>
  );
}

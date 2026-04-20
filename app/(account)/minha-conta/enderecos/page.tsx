import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AddressList } from "@/components/account/AddressList";

export const dynamic = "force-dynamic";

export default async function EnderecosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/minha-conta/enderecos");

  const addresses = await prisma.address.findMany({
    where: { customerId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      label: true,
      recipient: true,
      cep: true,
      street: true,
      number: true,
      complement: true,
      district: true,
      city: true,
      state: true,
      isDefault: true,
    },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-4xl text-[color:var(--pink-600)]">
            Meus endereços
          </h1>
          <p className="text-sm text-[color:var(--foreground)]/70 mt-1">
            Endereços salvos ficam disponíveis no checkout. O endereço padrão é sugerido automaticamente.
          </p>
        </div>
        <Link
          href="/minha-conta"
          className="text-sm text-[color:var(--pink-600)] hover:underline shrink-0"
        >
          ← Minha conta
        </Link>
      </div>

      <AddressList addresses={addresses} />
    </main>
  );
}

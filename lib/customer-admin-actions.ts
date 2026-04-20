"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { Role } from "@/lib/generated/prisma/enums";

// LGPD anonymize: strip PII from the customer row and delete addresses, but
// keep the Customer row (and therefore historical orders' customerId) so sales
// reporting and Tiny reconciliation survive. Orders themselves already have
// shippingAddress as a JSON snapshot — we overwrite those snapshots too so a
// deleted request removes the customer from anywhere they could be identified.
export async function anonymizeCustomer(id: string): Promise<{ ok: true }> {
  const session = await requireAdmin();
  if (session.user.id === id) {
    throw new Error("Não é possível anonimizar a própria conta logada.");
  }

  await prisma.$transaction(async (tx) => {
    const c = await tx.customer.findUnique({ where: { id } });
    if (!c) throw new Error("Cliente não encontrado.");
    if (c.role === Role.ADMIN) {
      throw new Error("Não é possível anonimizar contas admin.");
    }
    const stub = {
      email: `anon-${c.id}@removed.local`,
      name: "[anonimizado]",
      phone: null,
      cpf: null,
      passwordHash: null,
    };
    await tx.customer.update({ where: { id }, data: stub });
    await tx.address.deleteMany({ where: { customerId: id } });

    const orders = await tx.order.findMany({
      where: { customerId: id },
      select: { id: true },
    });
    for (const o of orders) {
      await tx.order.update({
        where: { id: o.id },
        data: {
          shippingAddress: {
            recipient: "[anonimizado]",
            cep: "",
            street: "",
            number: "",
            district: "",
            city: "",
            state: "",
            country: "BR",
          },
        },
      });
    }
  });
  revalidatePath("/admin/clientes");
  return { ok: true };
}

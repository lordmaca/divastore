"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeCep } from "@/lib/address";

// CRUD for /minha-conta/enderecos. The default-address invariant is enforced
// at the DB layer: `setDefault` clears isDefault on all siblings then sets it
// on the target, all in one transaction. Creating the first address auto-
// promotes it to default; deleting the default promotes the most recent
// sibling (if any) to default.

const addressSchema = z.object({
  label: z.string().trim().max(60).optional().or(z.literal("")),
  recipient: z.string().trim().min(2, "Informe o destinatário").max(120),
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  street: z.string().trim().min(1, "Rua obrigatória").max(200),
  number: z.string().trim().min(1, "Número obrigatório").max(20),
  complement: z.string().trim().max(120).optional().or(z.literal("")),
  district: z.string().trim().min(1, "Bairro obrigatório").max(120),
  city: z.string().trim().min(1, "Cidade obrigatória").max(120),
  state: z.string().trim().length(2, "UF com 2 letras").transform((v) => v.toUpperCase()),
});

export type AddressResult =
  | { ok: true; addressId?: string }
  | { ok: false; error: string };

function parseAddressForm(fd: FormData) {
  return addressSchema.safeParse({
    label: fd.get("label") ?? "",
    recipient: fd.get("recipient"),
    cep: fd.get("cep"),
    street: fd.get("street"),
    number: fd.get("number"),
    complement: fd.get("complement") ?? "",
    district: fd.get("district"),
    city: fd.get("city"),
    state: fd.get("state"),
  });
}

export async function createAddressAction(fd: FormData): Promise<AddressResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sessão expirada" };

  const parsed = parseAddressForm(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const d = parsed.data;

  const count = await prisma.address.count({ where: { customerId: session.user.id } });
  const isFirst = count === 0;

  const created = await prisma.address.create({
    data: {
      customerId: session.user.id,
      label: d.label || null,
      recipient: d.recipient,
      cep: normalizeCep(d.cep),
      street: d.street,
      number: d.number,
      complement: d.complement || null,
      district: d.district,
      city: d.city,
      state: d.state,
      isDefault: isFirst,
    },
    select: { id: true },
  });

  revalidatePath("/minha-conta/enderecos");
  revalidatePath("/checkout");
  return { ok: true, addressId: created.id };
}

export async function updateAddressAction(
  id: string,
  fd: FormData,
): Promise<AddressResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sessão expirada" };

  const existing = await prisma.address.findUnique({
    where: { id },
    select: { customerId: true },
  });
  if (!existing || existing.customerId !== session.user.id) {
    return { ok: false, error: "Endereço não encontrado" };
  }

  const parsed = parseAddressForm(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const d = parsed.data;

  await prisma.address.update({
    where: { id },
    data: {
      label: d.label || null,
      recipient: d.recipient,
      cep: normalizeCep(d.cep),
      street: d.street,
      number: d.number,
      complement: d.complement || null,
      district: d.district,
      city: d.city,
      state: d.state,
    },
  });

  revalidatePath("/minha-conta/enderecos");
  revalidatePath("/checkout");
  return { ok: true };
}

export async function deleteAddressAction(id: string): Promise<AddressResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sessão expirada" };

  const existing = await prisma.address.findUnique({
    where: { id },
    select: { customerId: true, isDefault: true },
  });
  if (!existing || existing.customerId !== session.user.id) {
    return { ok: false, error: "Endereço não encontrado" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });
    // If we dropped the default, promote the most recent sibling.
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { customerId: session.user!.id },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });

  revalidatePath("/minha-conta/enderecos");
  revalidatePath("/checkout");
  return { ok: true };
}

export async function setDefaultAddressAction(id: string): Promise<AddressResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sessão expirada" };

  const existing = await prisma.address.findUnique({
    where: { id },
    select: { customerId: true },
  });
  if (!existing || existing.customerId !== session.user.id) {
    return { ok: false, error: "Endereço não encontrado" };
  }

  await prisma.$transaction([
    prisma.address.updateMany({
      where: { customerId: session.user.id, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.address.update({ where: { id }, data: { isDefault: true } }),
  ]);

  revalidatePath("/minha-conta/enderecos");
  revalidatePath("/checkout");
  return { ok: true };
}

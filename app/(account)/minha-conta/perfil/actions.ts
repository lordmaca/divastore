"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { isValidCpf, sanitizeCpf } from "@/lib/cpf";

// Server actions for /minha-conta/perfil. Split in two so the UI can show
// independent success/error states per section without cross-contaminating.
// Email is intentionally NOT editable here — it's the login identity.

const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo").max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  cpf: z.string().trim().min(1, "Informe o CPF").max(20),
  marketingOptIn: z.coerce.boolean().optional().default(false),
  whatsappOptIn: z.coerce.boolean().optional().default(false),
});

export type ProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateProfileAction(formData: FormData): Promise<ProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sessão expirada" };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    cpf: formData.get("cpf") ?? "",
    marketingOptIn: formData.get("marketingOptIn") === "on",
    whatsappOptIn: formData.get("whatsappOptIn") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { name, phone, cpf, marketingOptIn, whatsappOptIn } = parsed.data;

  const cpfDigits = sanitizeCpf(cpf);
  if (!isValidCpf(cpfDigits)) {
    return { ok: false, error: "CPF inválido" };
  }

  const phoneDigits = phone ? phone.replace(/\D/g, "") : "";
  if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 13)) {
    return { ok: false, error: "Telefone inválido (10–13 dígitos)" };
  }

  // Keep opt-in timestamps accurate — set on flip from false→true, clear on
  // flip from true→false. The DB column is nullable, so absent = never opted in.
  const current = await prisma.customer.findUnique({
    where: { id: session.user.id },
    select: { marketingOptIn: true, whatsappOptIn: true },
  });
  if (!current) return { ok: false, error: "Conta não encontrada" };

  const now = new Date();
  const data: Prisma.CustomerUpdateInput = {
    name,
    phone: phoneDigits || null,
    cpf: cpfDigits,
    marketingOptIn,
    whatsappOptIn,
  };
  if (marketingOptIn !== current.marketingOptIn) {
    data.marketingOptInAt = marketingOptIn ? now : null;
  }
  if (whatsappOptIn !== current.whatsappOptIn) {
    data.whatsappOptInAt = whatsappOptIn ? now : null;
  }

  try {
    await prisma.customer.update({ where: { id: session.user.id }, data });
  } catch (err) {
    // CPF is @unique — collision means another account already has this CPF.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "CPF já cadastrado em outra conta" };
    }
    throw err;
  }

  revalidatePath("/minha-conta");
  revalidatePath("/minha-conta/perfil");
  return { ok: true };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: z.string().min(6, "A nova senha precisa ter no mínimo 6 caracteres").max(200),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(formData: FormData): Promise<ProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sessão expirada" };

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const user = await prisma.customer.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) {
    return { ok: false, error: "Defina uma senha via ‘Esqueci minha senha’" };
  }

  const ok = await compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "Senha atual incorreta" };

  const newHash = await hash(parsed.data.newPassword, 10);
  await prisma.customer.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash },
  });

  return { ok: true };
}

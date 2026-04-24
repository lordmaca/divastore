"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

const idSchema = z.string().min(1).max(40);

// Admin-only. Cascades messages via the ChatMessage→ChatConversation FK
// (onDelete: Cascade, see prisma/schema.prisma). This deletes the LOCAL
// mirror only — DivaHub remains the source of truth per the API contract
// §9. Purge from DivaHub happens via a separate LGPD endpoint (v1.1).

export async function deleteConversation(formData: FormData) {
  await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  const redirectTo = formData.get("redirectTo")?.toString() ?? null;

  await prisma.chatConversation.delete({ where: { id } });

  revalidatePath("/admin/conversas");
  if (redirectTo === "list") redirect("/admin/conversas");
}

export async function deleteConversationsBulk(formData: FormData) {
  await requireAdmin();
  const ids = formData
    .getAll("ids")
    .map((v) => v.toString())
    .filter((v) => v.length > 0 && v.length <= 40);
  if (ids.length === 0) return;
  await prisma.chatConversation.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/admin/conversas");
}

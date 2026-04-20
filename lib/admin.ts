import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/admin");
  if (session.user.role !== Role.ADMIN) redirect("/");
  return session;
}

export async function requireCustomer() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para continuar.");
  return session;
}

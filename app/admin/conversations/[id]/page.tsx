import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

// English-path alias — see ../page.tsx.

export const dynamic = "force-dynamic";

export default async function ConversationDetailAlias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  redirect(`/admin/conversas/${encodeURIComponent(id)}`);
}

import { redirect } from "next/navigation";

// English-path alias — see ../page.tsx.

export const dynamic = "force-dynamic";

export default async function ConversationDetailAlias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/conversas/${encodeURIComponent(id)}`);
}

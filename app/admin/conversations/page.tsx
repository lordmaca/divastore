import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

// English-path alias for the pt-BR canonical route at /admin/conversas.
// Keeps links from old comms / muscle memory working; the list view,
// filters, and delete buttons all live on the original page.

export const dynamic = "force-dynamic";

export default async function ConversationsAdminAlias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) for (const x of v) qs.append(k, x);
  }
  const suffix = qs.toString();
  redirect(`/admin/conversas${suffix ? `?${suffix}` : ""}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { setSetting, type SettingKey, SETTINGS_DEFINITIONS } from "@/lib/settings";

const updateSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export async function updateSetting(input: z.infer<typeof updateSchema>) {
  const session = await requireAdmin();
  const { key, value } = updateSchema.parse(input);
  if (!(key in SETTINGS_DEFINITIONS)) throw new Error("Setting desconhecido.");
  await setSetting(key as SettingKey, value as never, session.user.id);
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin");
}

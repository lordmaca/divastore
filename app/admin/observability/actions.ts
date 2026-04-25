"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { runScanner } from "@/lib/observability/scanner";
import { runEmailer } from "@/lib/observability/emailer";
import { setSetting } from "@/lib/settings";

const idSchema = z.string().min(1).max(40);

export async function resolveAlert(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = idSchema.parse(formData.get("id"));
  await prisma.alert.update({
    where: { id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: session.user.email ?? session.user.id ?? "admin",
    },
  });
  revalidatePath("/admin/observability");
}

export async function resolveAllAlerts(): Promise<void> {
  const session = await requireAdmin();
  await prisma.alert.updateMany({
    where: { resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolvedBy: session.user.email ?? session.user.id ?? "admin",
    },
  });
  revalidatePath("/admin/observability");
}

export async function runScanNow(): Promise<{
  openedOrUpdated: number;
  resolvedByRecovery: number;
  emailsSent: number;
}> {
  await requireAdmin();
  const scan = await runScanner();
  const mail = await runEmailer();
  revalidatePath("/admin/observability");
  return {
    openedOrUpdated: scan.openedOrUpdated,
    resolvedByRecovery: scan.resolvedByRecovery,
    emailsSent: mail.sent,
  };
}

const alertsConfigSchema = z.object({
  enabled: z.boolean(),
  recipients: z
    .array(z.string().email("e-mail inválido"))
    .min(1, "mantenha ao menos um destinatário"),
  emailCooldownMinutes: z.number().int().min(5).max(1440),
  integrationFailureStreak: z.number().int().min(1).max(100),
  backupMaxAgeHours: z.number().int().min(1).max(720),
  cronMaxMissedMultiplier: z.number().int().min(1).max(10),
});

export async function saveAlertsConfig(input: unknown): Promise<void> {
  const session = await requireAdmin();
  const parsed = alertsConfigSchema.parse(input);
  await setSetting("alerts.config", parsed, session.user.email ?? "admin");
  revalidatePath("/admin/observability");
}

const adminOrderNotificationsSchema = z.object({
  enabled: z.boolean(),
  recipients: z
    .array(z.string().email("e-mail inválido"))
    .min(0)
    .max(20, "até 20 destinatários"),
});

export async function saveAdminOrderNotifications(input: unknown): Promise<void> {
  const session = await requireAdmin();
  const parsed = adminOrderNotificationsSchema.parse(input);
  await setSetting(
    "notifications.adminOrders",
    parsed,
    session.user.email ?? "admin",
  );
  revalidatePath("/admin/observability");
}

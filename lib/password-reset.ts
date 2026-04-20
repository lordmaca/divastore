import crypto from "crypto";
import { prisma } from "@/lib/db";

export const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

export async function issueResetToken(customerId: string): Promise<{ raw: string; expiresAt: Date }> {
  const raw = generateRawToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.passwordResetToken.create({
    data: {
      customerId,
      tokenHash: hashToken(raw),
      expiresAt,
    },
  });
  return { raw, expiresAt };
}

export async function consumeResetToken(raw: string): Promise<{ customerId: string } | null> {
  const tokenHash = hashToken(raw);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { customerId: row.customerId };
}

export async function markUsed(raw: string): Promise<void> {
  await prisma.passwordResetToken.update({
    where: { tokenHash: hashToken(raw) },
    data: { usedAt: new Date() },
  });
}

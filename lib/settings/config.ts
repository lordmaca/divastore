import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  encryptSecret,
  decryptSecret,
  isEncryptedValue,
  type EncryptedValue,
} from "./secrets";

// Unified accessor layer for admin-editable configuration. This sits on
// top of SettingsKv (typed) and handles:
//   - plaintext-JSON settings (toggles, strings, shapes)  → getConfig / setConfig
//   - secret strings (API tokens, passwords)              → getSecret / setSecret
//
// Secrets are AES-256-GCM encrypted at rest. Callers never see the
// ciphertext — getSecret returns decrypted plaintext or null.
//
// Every set writes a SettingChange row (audit trail). Secret saves log the
// `last4` fingerprint only, never old/new plaintext.
//
// Env fallback was removed in Phase D of the settings-first migration; all
// secrets live in SettingsKv. Use `bdd migrate-env-to-db` once per
// environment to copy legacy env values in before removing them from
// `.env.local`.

// ---------- Secret registry ----------

export type SecretKey =
  | "email.smtp.user"
  | "email.smtp.pass"
  | "mp.accessToken"
  | "mp.webhookSecret"
  | "tiny.apiToken"
  | "tiny.webhookSecret"
  | "melhorenvio.token"
  | "melhorenvio.webhookSecret"
  | "divahub.apiKey"
  | "divahub.inboundApiKey"
  | "whatsapp.accessToken"
  | "s3.accessKeyId"
  | "s3.secretAccessKey";

// Per-request cache — avoids re-decrypting the same secret within one SSR
// pass. Short TTL so admin changes take effect quickly on the next request.
const TTL_MS = 30_000;
type CacheEntry = { value: string | null; expiresAt: number };
const cache = new Map<SecretKey, CacheEntry>();

export async function getSecret(key: SecretKey): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  let plaintext: string | null = null;
  const row = await prisma.settingsKv.findUnique({ where: { key } });
  if (row && isEncryptedValue(row.value)) {
    try {
      plaintext = decryptSecret(row.value as unknown as EncryptedValue);
    } catch (err) {
      console.error(`[settings] decrypt failed for ${key}`, err);
      plaintext = null;
    }
  }
  cache.set(key, { value: plaintext, expiresAt: now + TTL_MS });
  return plaintext;
}

export async function setSecret(
  key: SecretKey,
  plaintext: string,
  actor: string,
): Promise<void> {
  if (!plaintext) {
    throw new Error("Cannot set empty secret (use clearSecret instead)");
  }
  const encrypted = encryptSecret(plaintext);
  await prisma.$transaction([
    prisma.settingsKv.upsert({
      where: { key },
      create: { key, value: encrypted as unknown as Prisma.InputJsonValue, updatedBy: actor },
      update: { value: encrypted as unknown as Prisma.InputJsonValue, updatedBy: actor },
    }),
    prisma.settingChange.create({
      data: {
        settingKey: key,
        changedBy: actor,
        isSecret: true,
        diff: { last4: encrypted.last4 } as Prisma.InputJsonValue,
      },
    }),
  ]);
  cache.delete(key);
}

export async function clearSecret(key: SecretKey, actor: string): Promise<void> {
  await prisma.$transaction([
    prisma.settingsKv.deleteMany({ where: { key } }),
    prisma.settingChange.create({
      data: {
        settingKey: key,
        changedBy: actor,
        isSecret: true,
        diff: { cleared: true } as Prisma.InputJsonValue,
      },
    }),
  ]);
  cache.delete(key);
}

// Returns status + last-4 for UI display. Never leaks plaintext.
export type SecretStatus = {
  configured: boolean;
  // `source` is kept for backwards compat with UI components. After Phase D
  // it can only be "db" | null — env fallback was removed.
  source: "db" | null;
  last4: string | null;
  setBy: string | null;
  setAt: string | null;
};

export async function getSecretStatus(key: SecretKey): Promise<SecretStatus> {
  const row = await prisma.settingsKv.findUnique({ where: { key } });
  if (row && isEncryptedValue(row.value)) {
    const enc = row.value as unknown as EncryptedValue;
    return {
      configured: true,
      source: "db",
      last4: enc.last4 ?? null,
      setBy: row.updatedBy,
      setAt: row.updatedAt.toISOString(),
    };
  }
  return { configured: false, source: null, last4: null, setBy: null, setAt: null };
}

// ---------- Plain config write path ----------
// For non-secret keys, we keep using the existing getSetting / setSetting
// from `lib/settings.ts` — adding audit-trail writes here so the UI can
// surface "quem mudou o quê" uniformly.

export async function recordSettingChange(input: {
  settingKey: string;
  fieldPath?: string | null;
  changedBy: string;
  isSecret?: boolean;
  diff?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.settingChange.create({
    data: {
      settingKey: input.settingKey,
      fieldPath: input.fieldPath ?? null,
      changedBy: input.changedBy,
      isSecret: input.isSecret ?? false,
      diff: (input.diff ?? null) as Prisma.InputJsonValue,
    },
  });
}

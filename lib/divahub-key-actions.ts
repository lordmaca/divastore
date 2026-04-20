"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { getSetting, setSetting } from "@/lib/settings";

function hintOf(token: string): string {
  return token.length > 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : "…";
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

type StoredKeyPublic = {
  id: string;
  tokenHash: string;
  prefix: string;
  hint: string;
  label?: string;
  addedAt: string;
};

type StoredKeyInternal = StoredKeyPublic & { token?: string };

// One-shot migration: legacy rows stored the raw `token`. Normalize them to
// hash-only (preserving the hint for the UI) the first time we see them.
function migrate(keys: StoredKeyInternal[]): { keys: StoredKeyPublic[]; changed: boolean } {
  let changed = false;
  const out: StoredKeyPublic[] = keys.map((k) => {
    if (!k.tokenHash && k.token) {
      changed = true;
      return {
        id: k.id ?? crypto.randomUUID(),
        tokenHash: sha256Hex(k.token),
        prefix: k.token.slice(0, 9),
        hint: k.hint ?? hintOf(k.token),
        label: k.label,
        addedAt: k.addedAt,
      };
    }
    // Belt-and-suspenders: drop any lingering plaintext `token` field.
    const { token: _drop, ...rest } = k;
    void _drop;
    if (!rest.id) {
      changed = true;
      return { ...rest, id: crypto.randomUUID() };
    }
    return rest as StoredKeyPublic;
  });
  return { keys: out, changed };
}

export async function listDivahubKeys(adminId?: string): Promise<StoredKeyPublic[]> {
  const current = await getSetting("divahub.inboundKeys");
  const { keys, changed } = migrate(current.keys as StoredKeyInternal[]);
  if (changed && adminId) {
    await setSetting("divahub.inboundKeys", { keys }, adminId);
  }
  return keys;
}

export async function generateDivahubKey(label?: string): Promise<{ token: string; hint: string }> {
  const session = await requireAdmin();
  const token = `bd_${crypto.randomBytes(32).toString("hex")}`;
  const hint = hintOf(token);
  const prefix = token.slice(0, 9);
  const tokenHash = sha256Hex(token);

  const current = await getSetting("divahub.inboundKeys");
  const { keys } = migrate(current.keys as StoredKeyInternal[]);
  const next = {
    keys: [
      ...keys,
      {
        id: crypto.randomUUID(),
        tokenHash,
        prefix,
        hint,
        label: label?.trim() || "gerada no admin",
        addedAt: new Date().toISOString(),
      },
    ],
  };
  await setSetting("divahub.inboundKeys", next, session.user.id);
  revalidatePath("/admin/integrations");
  // The full token is returned once — to the admin who generated it — and never
  // stored. If they lose it, revoke and regenerate.
  return { token, hint };
}

export async function revokeDivahubKey(id: string): Promise<void> {
  const session = await requireAdmin();
  const current = await getSetting("divahub.inboundKeys");
  const { keys } = migrate(current.keys as StoredKeyInternal[]);
  const next = { keys: keys.filter((k) => k.id !== id) };
  await setSetting("divahub.inboundKeys", next, session.user.id);
  revalidatePath("/admin/integrations");
}

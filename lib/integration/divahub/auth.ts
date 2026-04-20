import crypto, { timingSafeEqual } from "crypto";
import { getSetting } from "@/lib/settings";
import { getSecret } from "@/lib/settings/config";

// Inbound auth for DivaHub-originated calls. Accepted keys come from two
// sources, merged at request time:
//   1. Encrypted `divahub.inboundApiKey` secret (single key, admin-editable).
//   2. SettingsKv "divahub.inboundKeys" — rotating set, admin UI at
//      /admin/integrations. Stored as SHA-256 hashes only.
//
// Single-secret key compared plaintext (only in memory). Rotating DB keys use
// SHA-256 hashes; we hash the presented token and compare in constant time.
// A DB read leak never exposes a working token.

async function primaryKeys(): Promise<string[]> {
  const secret = await getSecret("divahub.inboundApiKey");
  const raw = secret?.trim() ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

type DbKey = { id: string; tokenHash: string; prefix: string; hint: string };

async function dbKeys(): Promise<DbKey[]> {
  try {
    const s = await getSetting("divahub.inboundKeys");
    // Keep migration resilient even if a stale row (plaintext) is still present;
    // listDivahubKeys is the canonical migrator but we don't want to call a
    // server-action import from this edge-adjacent module.
    return s.keys
      .map((k) => ({
        id: k.id ?? "",
        tokenHash: k.tokenHash ?? "",
        prefix: k.prefix ?? "",
        hint: k.hint ?? "",
      }))
      .filter((k) => k.tokenHash.length === 64);
  } catch {
    return [];
  }
}

export type DivahubAuthResult =
  | { ok: true; keyHint: string }
  | { ok: false; status: 401 | 403; reason: string };

function hint(key: string): string {
  return key.length > 8 ? `${key.slice(0, 6)}…${key.slice(-3)}` : "…";
}

function sha256(buf: string): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

export async function authenticateDivahub(headers: Headers): Promise<DivahubAuthResult> {
  const [primary, db] = await Promise.all([primaryKeys(), dbKeys()]);
  if (primary.length === 0 && db.length === 0) {
    return { ok: false, status: 403, reason: "DivaHub inbound key not configured" };
  }

  const header = headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return { ok: false, status: 401, reason: "missing bearer token" };

  const presentedBuf = Buffer.from(presented);
  for (const key of primary) {
    const keyBuf = Buffer.from(key);
    if (keyBuf.length !== presentedBuf.length) continue;
    if (timingSafeEqual(keyBuf, presentedBuf)) {
      return { ok: true, keyHint: hint(key) };
    }
  }

  const presentedHash = sha256(presented);
  for (const k of db) {
    const storedHashBuf = Buffer.from(k.tokenHash, "hex");
    if (storedHashBuf.length !== presentedHash.length) continue;
    if (timingSafeEqual(storedHashBuf, presentedHash)) {
      return { ok: true, keyHint: k.hint || k.prefix || "…" };
    }
  }
  return { ok: false, status: 401, reason: "invalid bearer token" };
}

import crypto from "crypto";

// AES-256-GCM secret-at-rest helpers. Storage shape in SettingsKv.value:
//   { enc: b64, iv: b64, tag: b64, last4, setAt }
// We store the auth tag separately per GCM so verification fails closed if
// the row is tampered with. Key is 32 raw bytes — 64 hex chars from env.

const RAW_KEY = process.env.SETTINGS_ENCRYPTION_KEY ?? "";

export function encryptionKeyConfigured(): boolean {
  return /^[0-9a-f]{64}$/i.test(RAW_KEY);
}

function keyBuf(): Buffer {
  if (!encryptionKeyConfigured()) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY not configured (expected 64 hex chars = 32 bytes). " +
        "Generate with: openssl rand -hex 32",
    );
  }
  return Buffer.from(RAW_KEY, "hex");
}

export type EncryptedValue = {
  enc: string;      // base64 ciphertext
  iv: string;       // base64 12-byte nonce
  tag: string;      // base64 16-byte auth tag
  last4: string;    // plaintext tail, for UI confirmation display
  setAt: string;    // ISO timestamp
};

export function encryptSecret(plaintext: string): EncryptedValue {
  if (!plaintext) throw new Error("Cannot encrypt empty secret");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    last4: plaintext.length >= 4 ? plaintext.slice(-4) : plaintext,
    setAt: new Date().toISOString(),
  };
}

export function decryptSecret(value: EncryptedValue): string {
  const iv = Buffer.from(value.iv, "base64");
  const tag = Buffer.from(value.tag, "base64");
  const ct = Buffer.from(value.enc, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// Typeguard for stored-secret shape. Useful when a row could be a plain
// SettingsKv value (from a non-secret key written via the legacy path) vs
// a properly encrypted secret.
export function isEncryptedValue(v: unknown): v is EncryptedValue {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.enc === "string" &&
    typeof o.iv === "string" &&
    typeof o.tag === "string" &&
    typeof o.last4 === "string"
  );
}

// Display helper — never leaks more than the last 4 chars.
export function maskSecret(plaintext: string): string {
  const n = plaintext.length;
  if (n === 0) return "";
  if (n <= 4) return "•".repeat(n);
  return "•".repeat(Math.min(10, n - 4)) + plaintext.slice(-4);
}

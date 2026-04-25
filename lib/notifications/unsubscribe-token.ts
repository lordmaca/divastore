import crypto from "crypto";

// HMAC-signed unsubscribe tokens. The raw `Customer.id` primary key
// appearing as `?cid=...` was a one-click opt-out griefing vector — anyone
// who could guess or scrape a customer id could silently unsubscribe them.
//
// Now the URL carries `?u=<customerId>.<hex-hmac>` where the hmac is
// SHA-256 keyed by AUTH_SECRET (same secret that signs the session JWT —
// already required, already stable across deploys). Forgery requires the
// server secret; legitimate links stay tiny and cookie-free.
//
// The hmac does NOT embed an expiry: email links should remain valid as
// long as the customer has a password-reset mailbox to find them in.
// Rotating AUTH_SECRET invalidates every previously-issued link (desired
// on key rotation). Legacy unsigned links written before this change are
// rejected by `verify()` — those victims stop being exposed, and can
// unsubscribe via the next marketing email they receive (which will carry
// the new signed token).

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set — cannot sign unsubscribe tokens.");
  // AUTH_SECRET is already 64 hex chars in .env.local; use it directly as
  // bytes via utf-8 decode so we don't assume a specific format.
  return Buffer.from(secret, "utf-8");
}

export function signUnsubscribeToken(customerId: string): string {
  const mac = crypto
    .createHmac("sha256", getKey())
    .update(customerId)
    .digest("hex");
  return `${customerId}.${mac}`;
}

export function verifyUnsubscribeToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot >= token.length - 1) return null;
  const customerId = token.slice(0, dot);
  const presented = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", getKey()).update(customerId).digest("hex");
  try {
    const a = Buffer.from(presented, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return customerId;
}

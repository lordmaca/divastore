import crypto from "crypto";

// Short-lived HMAC-signed "I placed this order" token. Stamped into a
// cookie at the end of placeOrder and verified on /checkout/sucesso.
//
// Why: /checkout/sucesso is a public URL (it has to be — guests come back
// from Mercado Pago without a session). Before this, the page checked
// `order.customerId !== session.user.id` only when BOTH sides existed,
// which let an anonymous visitor load any order by guessing its id. The
// cookie token proves the requester is the same browser that submitted
// the checkout, without needing a session.
//
// Scope: only the `/checkout/sucesso` UI reads this. It's NOT a session
// replacement — it cannot touch cart state or orders, just allow viewing
// the success summary. The logged-in account page still uses the
// customerId comparison for its own authz.

const PURPOSE = "order-view";

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set — cannot sign order-view tokens.");
  return Buffer.from(secret, "utf-8");
}

export function signOrderViewToken(orderId: string): string {
  const mac = crypto
    .createHmac("sha256", getKey())
    .update(`${PURPOSE}:${orderId}`)
    .digest("hex");
  return `${orderId}.${mac}`;
}

export function verifyOrderViewToken(
  token: string | undefined | null,
  expectedOrderId: string,
): boolean {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot >= token.length - 1) return false;
  const orderId = token.slice(0, dot);
  if (orderId !== expectedOrderId) return false;
  const presented = token.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", getKey())
    .update(`${PURPOSE}:${orderId}`)
    .digest("hex");
  try {
    const a = Buffer.from(presented, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

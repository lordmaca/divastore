// Mercado Pago adapter.
// Real Checkout Pro preference creation when the access token is configured.
//
// Config resolution order per call (see loadMpConfig):
//   1. Admin-editable, encrypted DB settings (via getSecret)
//   2. process.env fallback (MP_ACCESS_TOKEN / MP_WEBHOOK_SECRET) — migration
//      safety, removed in Phase D
//
// SECURITY: when no access token is configured, createPreference() throws.
// We do NOT emit a self-clickable "stub success" URL — that would let any
// signed-in user mark their own AWAITING_PAYMENT order PAID. The webhook
// signature check requires a webhook secret in production; stub-accept of
// webhooks is gated on STOREFRONT_DEMO_MODE=true (dev only).

import crypto from "crypto";
import type { PaymentProvider, AdapterHealth } from "../types";
import { SITE_URL } from "@/lib/config";
import { getSecret } from "@/lib/settings/config";

type MpConfig = {
  accessToken: string;
  webhookSecret: string;
  publicBaseUrl: string;
  demoMode: boolean;
};

async function loadMpConfig(): Promise<MpConfig> {
  const [accessToken, webhookSecret] = await Promise.all([
    getSecret("mp.accessToken"),
    getSecret("mp.webhookSecret"),
  ]);
  return {
    accessToken: accessToken ?? "",
    webhookSecret: webhookSecret ?? "",
    publicBaseUrl: process.env.AUTH_URL?.replace(/\/$/, "") ?? SITE_URL,
    demoMode: process.env.STOREFRONT_DEMO_MODE === "true",
  };
}

type PrefInput = {
  orderId: string;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
  payer: { email: string; name?: string; phone?: string };
  shippingCostCents?: number;
  // When set, MP Checkout Pro surfaces only the matching method tab.
  // "pix" | "credit_card" | "bolbradesco"
  preferredPaymentMethod?: "pix" | "credit_card" | "bolbradesco";
};

export class MpNotConfiguredError extends Error {
  constructor() {
    super("Mercado Pago is not configured (access token missing).");
    this.name = "MpNotConfiguredError";
  }
}

async function mpFetch(cfg: MpConfig, path: string, init: RequestInit) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const mercadoPago: PaymentProvider = {
  name: "mercadopago",

  async isEnabled() {
    const cfg = await loadMpConfig();
    return Boolean(cfg.accessToken);
  },

  async health(): Promise<AdapterHealth> {
    const cfg = await loadMpConfig();
    if (!cfg.accessToken) {
      return { ok: false, detail: "not configured", checkedAt: new Date() };
    }
    return { ok: true, detail: "configured", checkedAt: new Date() };
  },

  async createPreference(input: PrefInput) {
    const cfg = await loadMpConfig();
    if (!cfg.accessToken) throw new MpNotConfiguredError();
    const items = input.items.map((it, idx) => ({
      id: `${input.orderId}-${idx}`,
      title: it.title.slice(0, 250),
      quantity: it.quantity,
      currency_id: "BRL",
      unit_price: it.unitPriceCents / 100,
    }));
    if ((input.shippingCostCents ?? 0) > 0) {
      items.push({
        id: `${input.orderId}-shipping`,
        title: "Frete",
        quantity: 1,
        currency_id: "BRL",
        unit_price: (input.shippingCostCents ?? 0) / 100,
      });
    }
    const payer: Record<string, unknown> = {
      email: input.payer.email,
      name: input.payer.name,
    };
    if (input.payer.phone) {
      // MP expects phone split into area_code + number. Crude split: last 9
      // digits are the number, preceding 2 are DDD. Skip if we can't tell.
      const digits = input.payer.phone.replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 13) {
        const trimmed = digits.slice(-11);
        payer.phone = {
          area_code: trimmed.slice(0, 2),
          number: trimmed.slice(2),
        };
      }
    }
    // We intentionally do NOT restrict payment methods on the preference.
    // The customer already picked one on our screen — but MP's account
    // config decides which methods are actually available (Pix requires
    // Pix key + PagBank approval, Boleto requires bank account, etc.).
    // Restricting by `excluded_payment_types` can leave only prepaid cards
    // visible if some methods aren't fully enabled, which is a worse UX
    // than just letting MP show every approved option.
    const body = {
      external_reference: input.orderId,
      items,
      payer,
      back_urls: {
        success: `${cfg.publicBaseUrl}/checkout/sucesso?orderId=${input.orderId}`,
        failure: `${cfg.publicBaseUrl}/checkout/falha?orderId=${input.orderId}`,
        pending: `${cfg.publicBaseUrl}/checkout/sucesso?orderId=${input.orderId}&pending=1`,
      },
      auto_return: "approved",
      notification_url: `${cfg.publicBaseUrl}/api/webhooks/mercadopago`,
    };
    const json = await mpFetch(cfg, "/checkout/preferences", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      initPoint: json.init_point as string,
      preferenceId: json.id as string,
    };
  },

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
    dataIdFromUrl?: string | null,
  ) {
    const cfg = await loadMpConfig();
    if (!cfg.webhookSecret) {
      // Without a secret, only a deliberate dev-mode flag accepts webhooks.
      // Production must always have a webhook secret configured.
      return cfg.demoMode;
    }
    try {
      const sig = headers["x-signature"] ?? headers["X-Signature"];
      const requestId = headers["x-request-id"] ?? headers["X-Request-Id"];
      if (!sig || !requestId) return false;

      const parts = Object.fromEntries(
        sig
          .split(",")
          .slice(0, 8) // guard against pathological inputs
          .map((p) => {
            const [k, v] = p.split("=");
            return [k.trim(), v?.trim()];
          }),
      );
      const ts = parts["ts"];
      const v1 = parts["v1"];
      if (!ts || !v1) return false;
      // v1 is a hex SHA-256 HMAC digest → 64 chars.
      if (!/^[0-9a-f]{64}$/i.test(v1)) return false;

      // Reject stale/forward-skewed timestamps to block replay.
      const tsNum = Number(ts);
      if (!Number.isFinite(tsNum)) return false;
      // MP can send ts in seconds OR milliseconds depending on the webhook
      // version. Normalize by detecting magnitude: a 10-digit value is
      // seconds, a 13-digit value is ms. Allow 10 min skew either way.
      const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
      if (Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false;

      // MP signs using `data.id` from the URL query string (`?data.id=...`),
      // NOT from the JSON body. The route passes the URL value; fall back to
      // the body for robustness.
      let dataId = dataIdFromUrl ?? undefined;
      if (!dataId) {
        try {
          dataId = JSON.parse(rawBody)?.data?.id?.toString();
        } catch {
          dataId = undefined;
        }
      }
      if (!dataId) return false;

      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const expectedBuf = crypto
        .createHmac("sha256", cfg.webhookSecret)
        .update(manifest)
        .digest();
      const v1Buf = Buffer.from(v1, "hex");
      if (expectedBuf.length !== v1Buf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, v1Buf);
    } catch {
      return false;
    }
  },
};

export async function fetchMpPayment(paymentId: string) {
  const cfg = await loadMpConfig();
  if (!cfg.accessToken) return null;
  try {
    return await mpFetch(cfg, `/v1/payments/${paymentId}`, { method: "GET" });
  } catch (err) {
    // MP's "simular entrega" panel sends payment id=123456 which 404s.
    // Treat any 404 as "not our payment" so the webhook replies 200 and
    // the test passes; real webhooks always carry a valid id.
    if (err instanceof Error && err.message.startsWith("MP 404")) return null;
    throw err;
  }
}

// Refund an MP payment. Omit `amountCents` for a full refund; pass a value
// less than the transaction total for a partial refund. MP returns the
// refund id + status + amount; callers store refundedCents from the
// payment's aggregate `refunded_amount` field (re-fetched by webhook) to
// stay consistent with externally-initiated refunds.
export async function refundMpPayment(input: {
  paymentId: string;
  amountCents?: number;
}): Promise<{
  refundId: string;
  amountCents: number;
  status: string;
  raw: unknown;
}> {
  const cfg = await loadMpConfig();
  if (!cfg.accessToken) throw new MpNotConfiguredError();
  const body: Record<string, unknown> = {};
  if (input.amountCents != null && input.amountCents > 0) {
    body.amount = input.amountCents / 100;
  }
  const json = (await mpFetch(cfg, `/v1/payments/${input.paymentId}/refunds`, {
    method: "POST",
    body: JSON.stringify(body),
  })) as {
    id?: string | number;
    amount?: number;
    status?: string;
  };
  if (json.id == null) {
    throw new Error("MP refund response missing id");
  }
  return {
    refundId: String(json.id),
    amountCents: Math.round((json.amount ?? 0) * 100),
    status: String(json.status ?? ""),
    raw: json,
  };
}

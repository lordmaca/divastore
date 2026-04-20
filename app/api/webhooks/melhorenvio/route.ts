import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { ShipmentStatus } from "@/lib/generated/prisma/enums";
import { applyShipmentWebhook } from "@/lib/shipments";
import { getSecret } from "@/lib/settings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Melhor Envio pushes shipment status updates. We verify the HMAC, map
// their status strings to our ShipmentStatus enum, and delegate to the
// orchestrator so cron/admin/CLI all share the same side-effect path.
//
// Payload shape (assumed per ME's published tracking structure; verify
// with the first real push and adjust mapping if needed):
//   { event: "shipment.status_updated", data: {
//       id: "<me_shipment_id>",
//       status: "posted" | "in_transit" | "out_for_delivery" | "delivered" | "exception",
//       tracking: "BR123...",
//       description?: "carrier note"
//   } }
//
// When MELHORENVIO_WEBHOOK_SECRET is unset, the endpoint rejects 401 on
// every request — no spoofing surface before ME is configured to push.

type Payload = {
  event?: string;
  data?: Record<string, unknown>;
  // ME sometimes nests under `orders` instead of `data`; we handle both.
  orders?: Array<Record<string, unknown>>;
};

const STATUS_MAP: Record<string, ShipmentStatus> = {
  released: ShipmentStatus.PURCHASED,
  pending: ShipmentStatus.PURCHASED,
  generated: ShipmentStatus.PRINTED,
  posted: ShipmentStatus.POSTED,
  shipped: ShipmentStatus.POSTED,
  in_transit: ShipmentStatus.IN_TRANSIT,
  intransit: ShipmentStatus.IN_TRANSIT,
  out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
  outfordelivery: ShipmentStatus.OUT_FOR_DELIVERY,
  delivered: ShipmentStatus.DELIVERED,
  exception: ShipmentStatus.EXCEPTION,
  failure: ShipmentStatus.EXCEPTION,
  returned: ShipmentStatus.RETURNED,
  cancelled: ShipmentStatus.CANCELLED,
  canceled: ShipmentStatus.CANCELLED,
};

async function verifySig(raw: string, sig: string | null): Promise<{ ok: boolean; configured: boolean }> {
  const secret = await getSecret("melhorenvio.webhookSecret");
  if (!secret) return { ok: false, configured: false };
  if (!sig) return { ok: false, configured: true };
  const cleaned = sig.replace(/^sha256=/i, "").trim();
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(cleaned, /^[0-9a-f]+$/i.test(cleaned) ? "hex" : "base64");
  } catch {
    return { ok: false, configured: true };
  }
  if (provided.length !== expected.length) return { ok: false, configured: true };
  return { ok: crypto.timingSafeEqual(expected, provided), configured: true };
}

function normalizeEntry(e: Record<string, unknown>): {
  providerShipmentId: string;
  status: ShipmentStatus;
  trackingCode: string | null;
  message: string | null;
} | null {
  const id =
    (e.id as string | undefined) ??
    (e.order_id as string | undefined) ??
    (e.shipment_id as string | undefined);
  if (!id) return null;
  const rawStatus = String(e.status ?? e.current_status ?? "").toLowerCase().replace(/\s+/g, "_");
  const status = STATUS_MAP[rawStatus];
  if (!status) return null;
  const trackingCode =
    (e.tracking as string | undefined) ??
    (e.melhorenvio_tracking as string | undefined) ??
    null;
  const message =
    (e.description as string | undefined) ??
    (e.message as string | undefined) ??
    null;
  return { providerShipmentId: id, status, trackingCode, message };
}

// Registration handshake: the ME panel POSTs an unsigned ping (empty or
// no-entry body) when you cadastra a URL and expects 200 before it lets you
// save. Return 200 without processing and log as `registration_ping`.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-melhorenvio-signature") ?? req.headers.get("x-signature");

  let payload: Payload | null = null;
  if (raw.trim().length > 0) {
    try {
      payload = JSON.parse(raw) as Payload;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
  }

  const entries: Array<Record<string, unknown>> = [];
  if (payload?.data) entries.push(payload.data);
  if (payload && Array.isArray(payload.orders)) entries.push(...payload.orders);

  // No entries = ME registration ping or empty keep-alive. Respond 200 so
  // the ME panel accepts the URL, but don't trust anything from it.
  if (entries.length === 0) {
    await prisma.integrationRun.create({
      data: {
        adapter: "melhorenvio",
        operation: "webhook",
        status: "registration_ping",
        payload: { event: payload?.event ?? null, signed: Boolean(sig) },
      },
    });
    return NextResponse.json({ ok: true, ping: true });
  }

  const verification = await verifySig(raw, sig);
  if (!verification.ok) {
    // When the secret isn't cadastrated yet (setup window), accept ME's
    // test POST with 200 so the panel lets the admin save the webhook.
    // Do NOT process entries — we can't trust them without a signature.
    if (!verification.configured) {
      await prisma.integrationRun.create({
        data: {
          adapter: "melhorenvio",
          operation: "webhook",
          status: "registration_ping",
          error: "secret not configured — accepted as setup ping, entries ignored",
          payload: { event: payload?.event ?? null, entries: entries.length },
        },
      });
      return NextResponse.json({ ok: true, ping: true, ignored: entries.length });
    }
    await prisma.integrationRun.create({
      data: {
        adapter: "melhorenvio",
        operation: "webhook",
        status: "rejected_signature",
        error: "bad signature",
      },
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let applied = 0;
  let skipped = 0;
  for (const e of entries) {
    const normalized = normalizeEntry(e);
    if (!normalized) {
      skipped++;
      continue;
    }
    try {
      const res = await applyShipmentWebhook({
        providerShipmentId: normalized.providerShipmentId,
        status: normalized.status,
        trackingCode: normalized.trackingCode,
        message: normalized.message,
        rawPayload: e,
      });
      if (res.changed) applied++;
      else skipped++;
    } catch (err) {
      console.error("[webhook:me] apply failed", err);
      skipped++;
    }
  }

  await prisma.integrationRun.create({
    data: {
      adapter: "melhorenvio",
      operation: "webhook",
      status: "ok",
      payload: { event: payload?.event ?? null, applied, skipped, entries: entries.length },
    },
  });

  return NextResponse.json({ ok: true, applied, skipped });
}

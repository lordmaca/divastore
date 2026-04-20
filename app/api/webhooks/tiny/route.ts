import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { StockSyncSource } from "@/lib/generated/prisma/enums";
import {
  reconcileStockFromTiny,
  summarize,
  outcomeAsPayload,
} from "@/lib/integration/tiny/stock-reconcile";
import { getSecret } from "@/lib/settings/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tiny pushes partial stock deltas here. We verify the HMAC, overlay the
// delta onto the current storefront catalog, and run the reconciler
// non-authoritatively (SKUs not in the payload keep their current value).
//
// Payload shape (assumed; adjust when Tiny's v3 config is live):
//   { event: "estoque.atualizado", dados: [{ sku: "ABC", saldo: 7 }, ...] }
//
// When TINY_WEBHOOK_SECRET is unset, this endpoint rejects every request —
// prevents spoofed writes in prod before Tiny is actually configured to push.

type Payload = {
  event?: string;
  dados?: Array<{ sku?: string; saldo?: number | string }>;
};

async function verifySig(raw: string, sig: string | null): Promise<{ ok: boolean; configured: boolean }> {
  const secret = await getSecret("tiny.webhookSecret");
  if (!secret) return { ok: false, configured: false };
  if (!sig) return { ok: false, configured: true };
  // Accept hex or base64, strip optional "sha256=" prefix.
  const cleaned = sig.replace(/^sha256=/i, "").trim();
  let expected: Buffer;
  try {
    expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest();
  } catch {
    return { ok: false, configured: true };
  }
  let provided: Buffer;
  try {
    provided = Buffer.from(cleaned, /^[0-9a-f]+$/i.test(cleaned) ? "hex" : "base64");
  } catch {
    return { ok: false, configured: true };
  }
  if (provided.length !== expected.length) return { ok: false, configured: true };
  return { ok: crypto.timingSafeEqual(expected, provided), configured: true };
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-tiny-signature");

  const verification = await verifySig(raw, sig);
  if (!verification.ok) {
    await prisma.integrationRun.create({
      data: {
        adapter: "tiny",
        operation: "stock.webhook",
        status: "rejected_signature",
        error: verification.configured
          ? "bad signature"
          : "Tiny webhook secret not configured",
      },
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const entries = Array.isArray(payload.dados) ? payload.dados : [];
  const snapshot = new Map<string, number | null>();
  for (const d of entries) {
    if (!d?.sku) continue;
    const n = typeof d.saldo === "string" ? parseFloat(d.saldo) : (d.saldo ?? 0);
    snapshot.set(String(d.sku), Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : 0);
  }

  const startedAt = Date.now();
  const run = await prisma.integrationRun.create({
    data: {
      adapter: "tiny",
      operation: "stock.webhook",
      status: "running",
      payload: { event: payload.event, count: snapshot.size },
    },
  });

  try {
    const outcome = await reconcileStockFromTiny({
      source: StockSyncSource.TINY_WEBHOOK,
      snapshot,
      authoritative: false,
      runId: run.id,
    });
    await prisma.integrationRun.update({
      where: { id: run.id },
      data: {
        status: outcome.ok ? "ok" : outcome.reason,
        durationMs: Date.now() - startedAt,
        payload: outcomeAsPayload(outcome),
        error: !outcome.ok ? summarize(outcome) : null,
      },
    });
    // Always 200 so Tiny doesn't retry — the run is durable in IntegrationRun.
    return NextResponse.json({ ok: true, summary: summarize(outcome) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.integrationRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: msg.slice(0, 500),
      },
    });
    // Still 200 — error is recorded; we don't want Tiny retrying on a bug on our side.
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 200 });
  }
}

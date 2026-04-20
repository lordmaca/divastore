import { NextResponse, type NextRequest } from "next/server";
import { lookupCep } from "@/lib/address";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE = { capacity: 30, refillPerSecond: 5 };

// Server-side proxy to ViaCEP. Keeps the browser on the same origin + lets us
// rate-limit + gives us an easy place to swap providers later.
export async function GET(req: NextRequest, ctx: { params: Promise<{ cep: string }> }) {
  const rl = rateLimit(`cep:${getClientIp(req.headers)}`, RATE);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const { cep } = await ctx.params;
  const r = await lookupCep(cep);
  if (!r) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...r });
}

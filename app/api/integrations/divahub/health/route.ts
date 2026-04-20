import { NextResponse, type NextRequest } from "next/server";
import { authenticateDivahub } from "@/lib/integration/divahub/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth-gated ping so DivaHub can verify connectivity + key validity from CI.
export async function GET(req: NextRequest) {
  const auth = await authenticateDivahub(req.headers);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  }
  return NextResponse.json({
    ok: true,
    service: "brilhodediva-storefront",
    keyHint: auth.keyHint,
    serverTime: new Date().toISOString(),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public liveness probe. Intentionally minimal — we do not expose adapter
// names, configuration state, or any reconnaissance signal here. Operators
// who need detail use the admin-only endpoint at /api/admin/health.
export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({ ok: dbOk }, { status: dbOk ? 200 : 503 });
}

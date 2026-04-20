import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/admin";
import { putObject, s3Enabled } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  if (!(await s3Enabled())) return bad("s3_not_configured", 503);

  const form = await req.formData().catch(() => null);
  if (!form) return bad("invalid_multipart");

  const file = form.get("file");
  const purposeRaw = form.get("purpose");
  const productIdRaw = form.get("productId");
  if (!(file instanceof File)) return bad("missing_file");

  const purpose =
    typeof purposeRaw === "string" && /^[a-z][a-z0-9-]{0,32}$/.test(purposeRaw)
      ? purposeRaw
      : "product";
  const productId =
    typeof productIdRaw === "string" && /^[a-z0-9]{20,40}$/i.test(productIdRaw)
      ? productIdRaw
      : "new";

  const ext = ALLOWED[file.type];
  if (!ext) return bad("unsupported_content_type", 415);
  if (file.size <= 0) return bad("empty_file");
  if (file.size > MAX_BYTES) return bad("file_too_large", 413);

  const bytes = Buffer.from(await file.arrayBuffer());
  const id = randomBytes(10).toString("hex");
  const keySuffix = `${purpose}s/${productId}/${id}.${ext}`;
  const { key, url } = await putObject({
    keySuffix,
    body: bytes,
    contentType: file.type,
  });

  return NextResponse.json({ ok: true, key, url });
}

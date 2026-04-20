import crypto from "crypto";
import net from "net";
import { lookup } from "dns/promises";
import { putObject, s3Enabled, publicBaseUrl } from "@/lib/s3";

// Mirror an external image into our public bucket so we control:
//   (1) permanence — DivaHub ships pre-signed OCI URLs that expire in 7 days;
//   (2) next/image — our bucket hostname is on remotePatterns;
//   (3) CDN-friendliness — stable URLs, long Cache-Control.
//
// SECURITY: any holder of a DivaHub inbound key can set product.images[].url.
// Without guards this is a server-side request forgery: the URL could point at
// 127.0.0.1, 169.254.169.254 (cloud metadata), RFC1918 hosts, or plain http.
// We resolve DNS, reject private / link-local / multicast / loopback targets,
// enforce https, disable redirects, cap response time + size, and only store
// responses whose Content-Type is image/*.

const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0) return true; // "this network"
    if (a === 10) return true;
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && parts[2] === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("ff")) return true; // multicast
    // IPv4-mapped
    const m = lower.match(/::ffff:([0-9.]+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return true; // unknown format → treat as unsafe
}

async function isSafeUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname;
  if (!host) return false;
  // Literal IP in the URL
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    for (const a of addrs) if (isPrivateIp(a.address)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function mirrorImageIfExternal(
  url: string,
  productSlug: string,
  index: number,
): Promise<string> {
  if (!url) return url;
  if (!(await s3Enabled())) return url;
  const ourBase = await publicBaseUrl();
  if (ourBase && url.startsWith(ourBase)) return url;
  if (!(await isSafeUrl(url))) return url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "error", signal: controller.signal });
    if (!res.ok) return url;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return url;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared && declared > MAX_BYTES) return url;
    const ext = EXT_BY_MIME[contentType] ?? "jpg";
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length === 0 || body.length > MAX_BYTES) return url;

    // Hash the bytes so re-mirrors of the same content collapse to the same key.
    const hash = crypto.createHash("sha1").update(body).digest("hex").slice(0, 12);
    const keySuffix = `divahub/${productSlug}/${index}-${hash}.${ext}`;
    const stored = await putObject({
      keySuffix,
      body,
      contentType: contentType || "image/jpeg",
    });
    return stored.url;
  } catch {
    // Don't block an upsert over an image mirror failure — fall back to the
    // original URL; the admin will see the broken thumb and can retry.
    return url;
  } finally {
    clearTimeout(timer);
  }
}

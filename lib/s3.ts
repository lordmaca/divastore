import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSetting } from "@/lib/settings";
import { getSecret } from "@/lib/settings/config";

// OCI Object Storage via S3 compatibility API.
// - Public bucket (storefront): product images, visibility = Public. GET via
//   the native endpoint (no auth, no CORS since rendering is server-side).
// - Private bucket (private):   sensitive docs, visibility = Private. GET via
//   short-lived presigned URLs served from admin-gated routes only.
//
// Both buckets share the same Customer Secret Key. Path-style addressing is
// required — OCI's TLS cert doesn't cover the virtual-host form.
//
// Config is resolved per call (cached in this module) from SettingsKv.
// Credentials are encrypted secrets (`s3.accessKeyId`, `s3.secretAccessKey`)
// via lib/settings/config.ts. Plain config (endpoint, buckets, etc.) lives
// under `s3.config`. Edit via /admin/configuracoes → Armazenamento.

type S3Config = {
  endpoint: string;
  region: string;
  publicBucket: string;
  privateBucket: string;
  prefix: string;
  publicBase: string;
  accessKeyId: string;
  secretAccessKey: string;
};

async function loadS3Config(): Promise<S3Config> {
  const [plain, accessKeyId, secretAccessKey] = await Promise.all([
    getSetting("s3.config"),
    getSecret("s3.accessKeyId"),
    getSecret("s3.secretAccessKey"),
  ]);
  return {
    endpoint: plain.endpoint,
    region: plain.region || "sa-saopaulo-1",
    publicBucket: plain.publicBucket,
    privateBucket: plain.privateBucket,
    prefix: plain.prefix,
    publicBase: plain.publicBaseUrl.replace(/\/$/, ""),
    accessKeyId: accessKeyId ?? "",
    secretAccessKey: secretAccessKey ?? "",
  };
}

// S3Client cache keyed on the (endpoint, region, accessKeyId) tuple so
// credential rotation invalidates the cached client automatically.
const clientCache = new Map<string, S3Client>();
function client(cfg: S3Config): S3Client {
  if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error("S3 not configured");
  }
  const key = `${cfg.endpoint}|${cfg.region}|${cfg.accessKeyId}`;
  let c = clientCache.get(key);
  if (!c) {
    c = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    clientCache.set(key, c);
  }
  return c;
}

export async function s3Enabled(): Promise<boolean> {
  const cfg = await loadS3Config();
  return Boolean(
    cfg.endpoint && cfg.publicBucket && cfg.publicBase && cfg.accessKeyId && cfg.secretAccessKey,
  );
}

export async function s3PrivateEnabled(): Promise<boolean> {
  const cfg = await loadS3Config();
  return Boolean(cfg.endpoint && cfg.privateBucket && cfg.accessKeyId && cfg.secretAccessKey);
}

export async function publicUrl(key: string): Promise<string> {
  const cfg = await loadS3Config();
  return `${cfg.publicBase}/${encodeURI(key)}`;
}

export async function publicBaseUrl(): Promise<string> {
  const cfg = await loadS3Config();
  return cfg.publicBase;
}

export async function putObject(input: {
  keySuffix: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<{ key: string; url: string }> {
  const cfg = await loadS3Config();
  if (!cfg.endpoint || !cfg.publicBucket || !cfg.publicBase || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error("Public S3 not configured");
  }
  const key = cfg.prefix + input.keySuffix.replace(/^\/+/, "");
  await client(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.publicBucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.length,
      CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
  return { key, url: `${cfg.publicBase}/${encodeURI(key)}` };
}

// Upload to the PRIVATE bucket. Never returns a public URL — call
// getPrivateSignedUrl(key) from an admin route to hand out short-lived access.
export async function putPrivateObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<{ key: string }> {
  const cfg = await loadS3Config();
  if (!cfg.endpoint || !cfg.privateBucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error("Private S3 bucket not configured");
  }
  const key = input.key.replace(/^\/+/, "");
  await client(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.privateBucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.length,
      CacheControl: "private, no-store",
    }),
  );
  return { key };
}

export async function getPrivateSignedUrl(key: string, ttlSeconds = 300): Promise<string> {
  const cfg = await loadS3Config();
  if (!cfg.endpoint || !cfg.privateBucket || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error("Private S3 bucket not configured");
  }
  return getSignedUrl(
    client(cfg),
    new GetObjectCommand({ Bucket: cfg.privateBucket, Key: key }),
    { expiresIn: Math.max(30, Math.min(3600, ttlSeconds)) },
  );
}

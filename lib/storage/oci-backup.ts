/**
 * OCI S3-compatible client scoped at the Brilho de Diva backup bucket.
 *
 * Reuses the same OCI credentials as the rest of the storefront (S3_*
 * env vars read by lib/s3.ts + the admin storage settings) but targets a
 * separate bucket so IAM, lifecycle, and ops are independent of the
 * product-asset bucket.
 *
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY  — OCI Customer Secret Key
 *   S3_NAMESPACE                              — OCI object-storage namespace
 *   S3_REGION                                 — e.g. sa-saopaulo-1
 *   BACKUP_S3_BUCKET                          — override, default `brilhodediva-backups`
 *
 * Consumers: scripts/backup.ts, scripts/restore-backup.ts,
 * scripts/prune-backups.ts. NOT used by app-serving code — this module
 * imports @aws-sdk/client-s3 eagerly and is meant for offline tooling only.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { createWriteStream } from "fs";
import { readFile } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const DEFAULT_BACKUP_BUCKET = "brilhodediva-backups";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;

  const keyId = process.env.S3_ACCESS_KEY_ID;
  const secret = process.env.S3_SECRET_ACCESS_KEY;
  const namespace = process.env.S3_NAMESPACE;
  const region = process.env.S3_REGION;

  if (!keyId || !secret || !namespace || !region) {
    throw new Error(
      "OCI backup client unavailable — set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, " +
        "S3_NAMESPACE and S3_REGION in .env.local (same values as the storefront's asset bucket).",
    );
  }

  _client = new S3Client({
    region,
    endpoint: `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com`,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
    forcePathStyle: true,
  });
  return _client;
}

export function getBackupBucket(): string {
  return process.env.BACKUP_S3_BUCKET || DEFAULT_BACKUP_BUCKET;
}

/**
 * Upload a local file into OCI. Loads the whole file as a Buffer — the OCI
 * S3-compatible endpoint rejects chunked transfer-encoding without an
 * explicit Content-Length. Backup archives run well under 200 MB so this
 * is safe; if they ever grow beyond that, switch to @aws-sdk/lib-storage.
 */
export async function uploadFile(
  localPath: string,
  objectKey: string,
  contentType = "application/octet-stream",
): Promise<void> {
  const client = getClient();
  const body = await readFile(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: getBackupBucket(),
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
    }),
  );
}

export async function uploadBuffer(
  buffer: Buffer,
  objectKey: string,
  contentType = "application/octet-stream",
): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBackupBucket(),
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    }),
  );
}

export async function downloadToFile(objectKey: string, localPath: string): Promise<void> {
  const client = getClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: getBackupBucket(), Key: objectKey }),
  );
  if (!res.Body) throw new Error(`Empty body for ${objectKey}`);
  await pipeline(res.Body as Readable, createWriteStream(localPath));
}

export async function downloadBuffer(objectKey: string): Promise<Buffer> {
  const client = getClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: getBackupBucket(), Key: objectKey }),
  );
  if (!res.Body) throw new Error(`Empty body for ${objectKey}`);
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export interface BackupObject {
  key: string;
  sizeBytes: number;
  modifiedAt: Date;
}

export async function listObjects(prefix: string): Promise<BackupObject[]> {
  const client = getClient();
  const out: BackupObject[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: getBackupBucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key && typeof o.Size === "number" && o.LastModified) {
        out.push({ key: o.Key, sizeBytes: o.Size, modifiedAt: o.LastModified });
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);
  return out;
}

export async function deleteObject(objectKey: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: getBackupBucket(), Key: objectKey }),
  );
}

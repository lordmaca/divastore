/**
 * Brilho de Diva encrypted offsite backup.
 *
 * Pipeline:
 *   1. pg_dump `brilhodediva` → postgres-<stamp>.pgcustom (custom format, compressed)
 *   2. Write manifest-<stamp>.json (sizes, sha256, git sha, prisma head)
 *   3. tar the dump + manifest → brilhodediva-<stamp>.tar
 *   4. GPG-encrypt for BACKUP_GPG_RECIPIENT → brilhodediva-<stamp>.tar.gpg
 *   5. Upload to OCI s3-compatible bucket (BACKUP_S3_BUCKET, default
 *      `brilhodediva-backups`) at {tier}/YYYY/MM/DD/brilhodediva-<stamp>.tar.gpg
 *      + the plaintext manifest next to it.
 *   6. Append an audit row to logs/backup.jsonl.
 *
 * `.env.local` is intentionally NOT in the archive. The SettingsKv master key
 * (BDD_SECRETS_KEY) and DATABASE_URL live in a password manager, not a backup.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backup.ts
 *   npx tsx --env-file=.env.local scripts/backup.ts --tier=weekly
 *   npx tsx --env-file=.env.local scripts/backup.ts --tier=monthly
 *   npx tsx --env-file=.env.local scripts/backup.ts --dry-run
 */

import { execFile, spawn, execSync } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, rm, stat, writeFile, appendFile } from "fs/promises";
import path from "path";
import os from "os";
import { uploadFile, uploadBuffer, getBackupBucket } from "@/lib/storage/oci-backup";
import { withCronHeartbeat } from "@/lib/observability/heartbeat";
import { prisma } from "@/lib/db";

const execFileAsync = promisify(execFile);

type Tier = "daily" | "weekly" | "monthly";

function parseArgs(): { tier: Tier; dryRun: boolean } {
  const argv = process.argv.slice(2);
  const tierArg = argv.find((a) => a.startsWith("--tier="))?.split("=")[1];
  const tier: Tier =
    tierArg === "weekly" || tierArg === "monthly" ? tierArg : "daily";
  const dryRun = argv.includes("--dry-run");
  return { tier, dryRun };
}

const APP_DIR = process.cwd();
// Scratch lives in /tmp so a crashed run can't fill the app disk, and the
// OS clears it on reboot as a safety net.
const SCRATCH = path.join(os.tmpdir(), `brilhodediva-backup-${Date.now()}`);

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: APP_DIR }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function prismaMigrationHead(): Promise<string> {
  try {
    const { readdir } = await import("fs/promises");
    const dir = path.join(APP_DIR, "prisma", "migrations");
    const entries = await readdir(dir);
    return entries.filter((n) => /^\d{14}/.test(n)).sort().pop() ?? "none";
  } catch {
    return "none";
  }
}

// Drop Prisma-only query params (?schema=, ?connection_limit=, …) that
// pg_dump rejects. libpq still reads host/user/password/port/db from the URL.
function stripPrismaOnlyQueryParams(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}

async function runPgDump(outputPath: string): Promise<void> {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL not set");
  const url = stripPrismaOnlyQueryParams(rawUrl);
  const args = [
    "--dbname",
    url,
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    outputPath,
  ];
  console.log(`[backup] pg_dump → ${outputPath}`);
  await execFileAsync("pg_dump", args, { maxBuffer: 64 * 1024 * 1024 });
}

interface Manifest {
  project: "brilhodediva";
  stamp: string;
  tier: Tier;
  createdAt: string;
  gitCommit: string;
  prismaHead: string;
  pgDumpBytes: number;
  bundleBytes: number;
  encryptedBytes: number;
  encryptedFor: string;
  hostname: string;
  nodeVersion: string;
  pgDumpSha256: string;
}

async function sha256File(p: string): Promise<string> {
  const { createHash } = await import("crypto");
  const { createReadStream } = await import("fs");
  return new Promise<string>((resolve, reject) => {
    const h = createHash("sha256");
    const stream = createReadStream(p);
    stream.on("error", reject);
    stream.on("data", (c) => h.update(c));
    stream.on("end", () => resolve(h.digest("hex")));
  });
}

async function composeBundle(
  pgDumpPath: string,
  manifestPath: string,
  outputPath: string,
): Promise<void> {
  const args = [
    "--create",
    "--file",
    outputPath,
    "--directory",
    path.dirname(pgDumpPath),
    path.basename(pgDumpPath),
    path.basename(manifestPath),
  ];
  console.log(`[backup] bundle → ${outputPath}`);
  await execFileAsync("tar", args);
}

async function gpgEncrypt(
  inputPath: string,
  outputPath: string,
  recipient: string,
): Promise<void> {
  const args = [
    "--batch",
    "--yes",
    "--trust-model",
    "always",
    "--recipient",
    recipient,
    "--output",
    outputPath,
    "--encrypt",
    inputPath,
  ];
  console.log(`[backup] gpg encrypt → ${outputPath}`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("gpg", args, { stdio: ["ignore", "inherit", "inherit"] });
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`gpg exited ${code}`)),
    );
  });
}

function objectKeyFor(tier: Tier, ts: string, ext: string): string {
  const year = ts.slice(0, 4);
  const month = ts.slice(4, 6);
  const day = ts.slice(6, 8);
  return `${tier}/${year}/${month}/${day}/brilhodediva-${ts}.${ext}`;
}

interface AuditRow {
  ts: string;
  stamp: string;
  tier: Tier;
  success: boolean;
  durationMs: number;
  bundleBytes?: number;
  encryptedBytes?: number;
  objectKey?: string;
  bucket?: string;
  error?: string;
}

async function writeAudit(row: AuditRow): Promise<void> {
  const dir = path.join(APP_DIR, "logs");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "backup.jsonl"), JSON.stringify(row) + "\n");
}

async function main() {
  const { tier, dryRun } = parseArgs();
  const recipient = process.env.BACKUP_GPG_RECIPIENT;
  if (!recipient) {
    throw new Error(
      "BACKUP_GPG_RECIPIENT not set — add it to .env.local (e.g. backup@divahub.local).",
    );
  }

  const ts = stamp();
  const started = Date.now();
  const auditBase: AuditRow = {
    ts: new Date().toISOString(),
    stamp: ts,
    tier,
    success: false,
    durationMs: 0,
  };

  try {
    await mkdir(SCRATCH, { recursive: true });

    const pgDumpPath = path.join(SCRATCH, `postgres-${ts}.pgcustom`);
    const manifestPath = path.join(SCRATCH, `manifest-${ts}.json`);
    const bundlePath = path.join(SCRATCH, `brilhodediva-${ts}.tar`);
    const encPath = path.join(SCRATCH, `brilhodediva-${ts}.tar.gpg`);

    await runPgDump(pgDumpPath);
    const [pgStat, pgSha] = await Promise.all([stat(pgDumpPath), sha256File(pgDumpPath)]);

    const manifest: Manifest = {
      project: "brilhodediva",
      stamp: ts,
      tier,
      createdAt: new Date().toISOString(),
      gitCommit: gitSha(),
      prismaHead: await prismaMigrationHead(),
      pgDumpBytes: pgStat.size,
      bundleBytes: 0,
      encryptedBytes: 0,
      encryptedFor: recipient,
      hostname: os.hostname(),
      nodeVersion: process.version,
      pgDumpSha256: pgSha,
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    await composeBundle(pgDumpPath, manifestPath, bundlePath);
    manifest.bundleBytes = (await stat(bundlePath)).size;

    await gpgEncrypt(bundlePath, encPath, recipient);
    manifest.encryptedBytes = (await stat(encPath)).size;

    // Rewrite manifest with final sizes so the uploaded manifest agrees
    // with the audit row.
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const encKey = objectKeyFor(tier, ts, "tar.gpg");
    const manifestKey = objectKeyFor(tier, ts, "manifest.json");

    if (dryRun) {
      console.log(
        `[backup] --dry-run — skipping upload. Would upload to bucket ${getBackupBucket()}:\n` +
          `  ${encKey} (${manifest.encryptedBytes} bytes)\n` +
          `  ${manifestKey}`,
      );
    } else {
      await uploadFile(encPath, encKey, "application/pgp-encrypted");
      await uploadBuffer(
        Buffer.from(await readFile(manifestPath)),
        manifestKey,
        "application/json",
      );
      console.log(`[backup] uploaded ${encKey} to bucket ${getBackupBucket()}`);
    }

    await writeAudit({
      ...auditBase,
      success: true,
      durationMs: Date.now() - started,
      bundleBytes: manifest.bundleBytes,
      encryptedBytes: manifest.encryptedBytes,
      objectKey: dryRun ? undefined : encKey,
      bucket: dryRun ? undefined : getBackupBucket(),
    });

    console.log(
      `[backup] done in ${Date.now() - started}ms — ${manifest.encryptedBytes} bytes encrypted`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backup] FAILED: ${message}`);
    await writeAudit({
      ...auditBase,
      success: false,
      durationMs: Date.now() - started,
      error: message,
    });
    process.exitCode = 1;
  } finally {
    await rm(SCRATCH, { recursive: true, force: true }).catch(() => {});
  }
}

// Cron schedule is per-tier — use the argv to pick the label so each tier
// has its own heartbeat row (backup-daily, backup-weekly, backup-monthly).
const tierForHeartbeat =
  process.argv.find((a) => a.startsWith("--tier="))?.split("=")[1] ?? "daily";
const scheduleByTier: Record<string, string> = {
  daily: "0 3 * * *",
  weekly: "5 3 * * 0",
  monthly: "10 3 1 * *",
};

withCronHeartbeat(`backup-${tierForHeartbeat}`, main, {
  schedule: scheduleByTier[tierForHeartbeat],
})
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

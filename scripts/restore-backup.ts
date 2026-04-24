/**
 * Brilho de Diva backup restore helper.
 *
 * Opinionated end-to-end restore:
 *   1. List (or download) an encrypted archive from the backup bucket.
 *   2. gpg --decrypt (requires the private key imported locally).
 *   3. tar -x to reveal postgres-<stamp>.pgcustom + manifest-<stamp>.json.
 *   4. pg_restore into a target DB (DATABASE_URL_RESTORE, NOT DATABASE_URL).
 *
 * Never targets production DATABASE_URL by default — you MUST set a separate
 * DATABASE_URL_RESTORE pointing at a throwaway database (e.g. a freshly
 * created `brilhodediva_restore` on the same server). This prevents an
 * accidental rollback of the live DB.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/restore-backup.ts --list
 *   npx tsx --env-file=.env.local scripts/restore-backup.ts --list --tier=weekly
 *   npx tsx --env-file=.env.local scripts/restore-backup.ts --key=daily/2026/04/24/brilhodediva-20260424-030000.tar.gpg
 *   npx tsx --env-file=.env.local scripts/restore-backup.ts --latest
 *   npx tsx --env-file=.env.local scripts/restore-backup.ts --latest --tier=monthly --download-only
 */

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { mkdir, readFile, rm } from "fs/promises";
import path from "path";
import os from "os";
import {
  downloadToFile,
  listObjects,
  getBackupBucket,
} from "@/lib/storage/oci-backup";

const execFileAsync = promisify(execFile);

type Tier = "daily" | "weekly" | "monthly";

type Opts = {
  list: boolean;
  latest: boolean;
  downloadOnly: boolean;
  key: string | null;
  tier: Tier;
};

function parseArgs(): Opts {
  const argv = process.argv.slice(2);
  const tierArg = argv.find((a) => a.startsWith("--tier="))?.split("=")[1];
  const tier: Tier =
    tierArg === "weekly" || tierArg === "monthly" ? tierArg : "daily";
  return {
    list: argv.includes("--list"),
    latest: argv.includes("--latest"),
    downloadOnly: argv.includes("--download-only"),
    key: argv.find((a) => a.startsWith("--key="))?.split("=")[1] ?? null,
    tier,
  };
}

function stripPrismaOnlyQueryParams(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}

async function gpgDecrypt(input: string, output: string): Promise<void> {
  const args = ["--batch", "--yes", "--output", output, "--decrypt", input];
  console.log(`[restore] gpg decrypt → ${output}`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("gpg", args, { stdio: ["ignore", "inherit", "inherit"] });
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`gpg exited ${code}`)),
    );
  });
}

async function tarExtract(bundle: string, destDir: string): Promise<void> {
  const args = ["--extract", "--file", bundle, "--directory", destDir];
  console.log(`[restore] tar -x ${bundle} → ${destDir}`);
  await execFileAsync("tar", args);
}

async function runPgRestore(pgcustom: string, url: string): Promise<void> {
  const args = [
    "--dbname",
    url,
    "--no-owner",
    "--no-acl",
    "--clean",
    "--if-exists",
    "--exit-on-error",
    pgcustom,
  ];
  console.log(`[restore] pg_restore → ${url.replace(/:[^:@/]+@/, ":<pw>@")}`);
  await execFileAsync("pg_restore", args, { maxBuffer: 128 * 1024 * 1024 });
}

async function resolveKey(opts: Opts): Promise<string> {
  if (opts.key) return opts.key;
  if (!opts.latest) {
    throw new Error(
      "Specify either --key=<objectKey> or --latest (optionally with --tier=weekly|monthly).",
    );
  }
  const objs = await listObjects(`${opts.tier}/`);
  const archives = objs
    .filter((o) => o.key.endsWith(".tar.gpg"))
    .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  if (archives.length === 0) {
    throw new Error(
      `No archives found under ${opts.tier}/ in bucket ${getBackupBucket()}.`,
    );
  }
  console.log(`[restore] --latest → ${archives[0].key}`);
  return archives[0].key;
}

async function main() {
  const opts = parseArgs();

  if (opts.list) {
    const objs = await listObjects(`${opts.tier}/`);
    const archives = objs
      .filter((o) => o.key.endsWith(".tar.gpg"))
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    console.log(
      `[restore] ${archives.length} archive(s) in tier=${opts.tier} bucket=${getBackupBucket()}`,
    );
    for (const o of archives.slice(0, 30)) {
      const mb = (o.sizeBytes / (1024 * 1024)).toFixed(1);
      console.log(`  ${o.modifiedAt.toISOString()}  ${mb} MB  ${o.key}`);
    }
    return;
  }

  const key = await resolveKey(opts);
  const stamp = Date.now();
  const scratch = path.join(os.tmpdir(), `brilhodediva-restore-${stamp}`);
  await mkdir(scratch, { recursive: true });

  try {
    const encPath = path.join(scratch, path.basename(key));
    console.log(`[restore] download ${key} → ${encPath}`);
    await downloadToFile(key, encPath);

    const tarPath = encPath.replace(/\.gpg$/, "");
    await gpgDecrypt(encPath, tarPath);

    const extractDir = path.join(scratch, "extracted");
    await mkdir(extractDir, { recursive: true });
    await tarExtract(tarPath, extractDir);

    const { readdir } = await import("fs/promises");
    const entries = await readdir(extractDir);
    const pgcustom = entries.find((n) => n.endsWith(".pgcustom"));
    const manifest = entries.find((n) => n.endsWith(".json"));
    if (!pgcustom) throw new Error("no .pgcustom inside archive — corrupt bundle?");
    const pgcustomPath = path.join(extractDir, pgcustom);
    if (manifest) {
      console.log(`[restore] manifest:\n${await readFile(path.join(extractDir, manifest), "utf-8")}`);
    }

    if (opts.downloadOnly) {
      console.log(
        `[restore] --download-only — decrypted dump at ${pgcustomPath}. ` +
          `Run pg_restore manually when ready.`,
      );
      return;
    }

    const target = process.env.DATABASE_URL_RESTORE;
    if (!target) {
      throw new Error(
        "DATABASE_URL_RESTORE not set. Add it to .env.local pointing at a THROWAWAY DB " +
          "(e.g. postgres://brilhodediva:...@127.0.0.1:5432/brilhodediva_restore). " +
          "Refusing to restore into DATABASE_URL to protect production.",
      );
    }
    await runPgRestore(pgcustomPath, stripPrismaOnlyQueryParams(target));

    console.log(`[restore] done — restored ${key} into DATABASE_URL_RESTORE.`);
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

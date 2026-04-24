# Brilho de Diva — Backup & Restore Runbook

Encrypted nightly backup of the `brilhodediva` Postgres database, shipped to a
private OCI Object Storage bucket. GPG-encrypted client-side — only someone
with the matching private key can decrypt. Used for disaster recovery and
point-in-time rollback.

This runbook covers the mechanical steps. For the architectural rationale
(why encrypted offsite, why tiered retention, why a separate bucket from the
product-asset bucket) see the commit that introduced it.

---

## 1. Architecture

```
brilhodediva server (Ubuntu)

  pg_dump ──▶ postgres-<ts>.pgcustom ─┐
                                       ├─▶ tar ─▶ brilhodediva-<ts>.tar ─┐
  manifest-<ts>.json ──────────────────┘                                 │
                                                            │            │
                                                            ▼            │
                                                 gpg --encrypt           │
                                                       │                 │
                                                       ▼                 │
                                       brilhodediva-<ts>.tar.gpg ◀───────┘
                                                       │
                                                       ▼
                      aws-sdk S3 client ──▶ oci://brilhodediva-backups/
```

Object key layout:

```
daily/2026/04/24/brilhodediva-20260424-030000.tar.gpg
daily/2026/04/24/brilhodediva-20260424-030000.manifest.json
weekly/…          (Sunday 03:05 UTC)
monthly/…         (1st of month 03:10 UTC)
```

---

## 2. What is (and isn't) in a backup

### Included

- **`brilhodediva` Postgres database**, full `pg_dump --format=custom --no-owner --no-acl`.
  That's everything the site runs on: `Product`, `Variant`, `Image`, `Order`,
  `OrderItem`, `Customer`, `Address`, `Payment`, `Review`, `Coupon`, `Cart`,
  `ChatConversation`/`ChatMessage`, `Notification`, `IntegrationRun`,
  `SettingsKv` (with its encrypted secrets still at rest),
  `HeroSlide`, `CategoryAuditIssue`, etc.

### Excluded (intentionally)

- **`.env.local`** — plaintext secrets live in a password manager. The archive
  cannot decrypt `SettingsKv` without the master key, and the master key is
  never in a backup. Restore manually from the vault.
- **S3/OCI asset bucket contents** — the storefront's image/video bucket is
  durable (OCI replicates + you have lifecycle on it). The DB stores *references*
  (URLs), not blobs. If the asset bucket is ever lost, that's a separate
  recovery — this backup doesn't address it.
- **`node_modules/`, `.next/`, `lib/generated/`** — reproducible from git +
  `npm ci` + `npm run build`.
- **git history** — already mirrored to GitHub (`lordmaca/divastore`) by the
  existing `brilhodediva-backup` PM2 job.
- **Logs** — retention is set per log, not nightly-archive-worthy.

### Encryption

Every archive is GPG-encrypted for the recipient identified by
`BACKUP_GPG_RECIPIENT` (e.g. `backup@divahub.local` — the same key DivaHub
uses; a single keypair can encrypt for any number of projects because the
decryption is by private-key, not per-project). Only the holder of the private
key can decrypt. OCI server-side encryption is a second, dependent layer — not
the primary defence.

---

## 3. One-off setup

These steps run **once per environment**. The PM2 crons below do the rest.

### 3.1 Create the backup bucket

Via the OCI Console → Object Storage → Create Bucket:

- Name: **`brilhodediva-backups`**
- Storage tier: Standard
- Encryption: default (OCI-managed keys — our GPG layer sits on top)
- Versioning: enabled (belt-and-braces — catches accidental overwrites)
- Visibility: **private** (default)
- Namespace/region: same as the existing `brilhodediva-*` asset buckets

Then grant the storefront service the minimum policy to read/write + list
inside that bucket. If you already have a `brilhodediva-svc` policy for the
asset buckets, add:

```
Allow dynamic-group <svc-group> to manage objects in compartment <id> where target.bucket.name='brilhodediva-backups'
Allow dynamic-group <svc-group> to read  buckets in compartment <id> where target.bucket.name='brilhodediva-backups'
```

### 3.2 Import the GPG public key on the server

The public key was generated off-server and already lives in the GPG keyring
on this host (shared with DivaHub, key id `1504D5DAB7A7E1857B7167317EE118E5EA5FF1ED`,
uid `DivaHub Backups <backup@divahub.local>`). Verify with:

```bash
gpg --list-keys backup@divahub.local
```

If the key is ever missing (e.g. fresh server), re-import from the workstation
public-key export (`.asc` file). The **private key** should NEVER be on the
server — only on your workstation and in a password manager.

### 3.3 Add env vars to `.env.local`

```bash
# Required — fails the backup script at startup if missing.
BACKUP_GPG_RECIPIENT=backup@divahub.local

# Optional — defaults to "brilhodediva-backups".
# BACKUP_S3_BUCKET=brilhodediva-backups

# Optional — only set when you need to run a restore. Points at a THROWAWAY
# DB so restore cannot clobber DATABASE_URL (production) by accident.
# DATABASE_URL_RESTORE=postgres://brilhodediva:<pw>@127.0.0.1:5432/brilhodediva_restore
```

The storefront already has `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`S3_NAMESPACE`, and `S3_REGION` configured for the product-asset bucket —
`lib/storage/oci-backup.ts` reuses those automatically.

### 3.4 Enable + persist the PM2 jobs

```bash
pm2 start /home/ubuntu/brilhodedivasite/ecosystem.config.js
pm2 save
```

You should now see four new stopped jobs (they only fire on their cron):

```
brilhodediva-backup-daily     03:00 UTC every day
brilhodediva-backup-weekly    03:05 UTC Sundays
brilhodediva-backup-monthly   03:10 UTC day 1 each month
brilhodediva-backup-prune     04:00 UTC every day (retention enforcer)
```

---

## 4. Daily operation

The crons do everything. To verify the health manually:

```bash
# Tail the latest daily run
tail -f /home/ubuntu/brilhodedivasite/logs/backup-daily-out.log

# Audit trail (one JSON row per run — success, duration, sizes, object key)
tail /home/ubuntu/brilhodedivasite/logs/backup.jsonl | jq

# See what's in the bucket via the restore script's --list mode
cd /home/ubuntu/brilhodedivasite
npx tsx --env-file=.env.local scripts/restore-backup.ts --list
npx tsx --env-file=.env.local scripts/restore-backup.ts --list --tier=weekly
```

### Ad-hoc backup

Useful before a risky migration:

```bash
cd /home/ubuntu/brilhodedivasite
npx tsx --env-file=.env.local scripts/backup.ts            # → daily/
npx tsx --env-file=.env.local scripts/backup.ts --tier=weekly
npx tsx --env-file=.env.local scripts/backup.ts --dry-run  # skip upload
```

### Retention

- `daily/` — 30 days
- `weekly/` — 84 days (12 weeks)
- `monthly/` — 365 days

The `brilhodediva-backup-prune` cron enforces this nightly with
`--delete`. Run the same script without `--delete` to preview:

```bash
npx tsx --env-file=.env.local scripts/prune-backups.ts
```

---

## 5. Restore — disaster recovery

**Never restore into `DATABASE_URL` directly.** The script refuses unless
`DATABASE_URL_RESTORE` is set separately, which must point at a different DB.
Restore-in-place is an admin promotion you do after verifying the throwaway DB
came up clean.

### 5.1 Create a throwaway DB on the same server

```bash
sudo -u postgres createdb -O brilhodediva brilhodediva_restore
```

Add to `.env.local` (temporarily):

```
DATABASE_URL_RESTORE=postgres://brilhodediva:<password>@127.0.0.1:5432/brilhodediva_restore
```

### 5.2 Ensure you have the GPG private key

The private key lives in your password manager, not on the server. Import it
*only on your workstation* — or temporarily on a restore-specific machine —
then do the restore there and ship the `pg_restore` output back.

Alternative: import the private key on the server just for the duration of a
restore, then remove it:

```bash
# On workstation — export and copy to server (NOT in the archive, scp it).
gpg --export-secret-keys --armor backup@divahub.local > /tmp/priv.asc
scp /tmp/priv.asc ubuntu@server:/tmp/priv.asc
shred -u /tmp/priv.asc

# On server
gpg --import /tmp/priv.asc
shred -u /tmp/priv.asc
# (when done) gpg --delete-secret-keys backup@divahub.local
```

### 5.3 Run the restore

```bash
cd /home/ubuntu/brilhodedivasite

# List what's in the bucket so you can pick an archive
npx tsx --env-file=.env.local scripts/restore-backup.ts --list

# Restore a specific key
npx tsx --env-file=.env.local scripts/restore-backup.ts \
  --key=daily/2026/04/24/brilhodediva-20260424-030000.tar.gpg

# Or just the latest daily
npx tsx --env-file=.env.local scripts/restore-backup.ts --latest

# Or the latest weekly/monthly
npx tsx --env-file=.env.local scripts/restore-backup.ts --latest --tier=weekly
```

The script will:

1. Download the `.tar.gpg`.
2. Decrypt via GPG (interactive passphrase prompt).
3. Extract the bundle.
4. Print the manifest.
5. `pg_restore` into `DATABASE_URL_RESTORE` with `--clean --if-exists`.

If you only want to keep the decrypted dump without restoring, pass
`--download-only`.

### 5.4 Promote to production

Only after verifying the restore DB looks sane:

```bash
# Stop the app
pm2 stop brilhodediva

# Swap DBs (example — adjust to your ops preference)
sudo -u postgres psql -c "ALTER DATABASE brilhodediva RENAME TO brilhodediva_rollback;"
sudo -u postgres psql -c "ALTER DATABASE brilhodediva_restore RENAME TO brilhodediva;"

# Restart
pm2 start brilhodediva --update-env

# Verify
curl -I https://divahub.brilhodediva.com.br  # MUST still be 307
curl  https://loja.brilhodediva.com.br/api/health
```

Keep `brilhodediva_rollback` around for at least 72 hours in case the restore
turns out to be the wrong moment-in-time.

---

## 6. Troubleshooting

### `BACKUP_GPG_RECIPIENT not set`

Add to `.env.local` — see §3.3.

### `gpg: <recipient>: skipped: No public key`

The public key isn't in the keyring. Re-import it (§3.2) or verify the email
in `BACKUP_GPG_RECIPIENT` matches the uid `gpg --list-keys` shows.

### `The Content-Length header is required` from OCI

Happens if we ever upload via streaming. The current
`lib/storage/oci-backup.ts` buffers before upload, so this shouldn't fire. If
archives ever exceed ~200 MB, switch to `@aws-sdk/lib-storage`'s multipart
`Upload` helper (it sets the header per-part).

### `pg_dump: server version mismatch`

`pg_dump` and Postgres versions must match or `pg_dump` must be newer. Check
`pg_dump --version` against `psql --version`. On this server both come from
the `postgresql-16` apt package; don't install `postgresql-client-17` without
coordinating.

### A backup ran but no object appeared in the bucket

Check `logs/backup-daily-err.log` — S3 permissions are the usual cause. Verify
the `brilhodediva-svc` policy covers the new bucket (§3.1) and that the
`S3_*` creds in `.env.local` aren't the asset-bucket-only scoped key.

### Script imports `@/lib/...` but tsx can't resolve it

All scripts run with `npx tsx --env-file=.env.local` from the project root.
If you get `Cannot find module '@/...'`, make sure you're in
`/home/ubuntu/brilhodedivasite`, not somewhere else. `tsconfig.json`'s path
alias does the rest.

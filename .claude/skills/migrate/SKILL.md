---
name: migrate
description: Apply a Prisma schema change against the live brilhodediva Postgres. Use when prisma/schema.prisma has uncommitted changes and the DB needs to catch up. Replaces the broken `npx prisma migrate dev` flow (which hangs in non-interactive mode) with the diff→SQL→apply→mark pattern we've verified works.
---

# Migrate

## Why this exists
Prisma 7 + non-interactive sessions break `prisma migrate dev` — it refuses to prompt, fails on the shadow-database requirement, and silently produces empty migrations when the schema was edited mid-session. Every migration in this repo has been done via the same manual dance; this skill codifies it.

## Safe Harbor
- The only DB it touches is `brilhodediva` on `127.0.0.1:5432` (role `brilhodediva`). Never point this at DivaHub's DB.
- Do NOT run against a production snapshot without `pg_dump` first.
- Refuse to run if the schema has fields that would drop a column with existing rows. Check `prisma migrate diff` output before applying.

## Steps

1. **Verify you're in the storefront**:
   ```bash
   test -f /home/ubuntu/brilhodedivasite/prisma/schema.prisma
   ```

2. **Generate the migration SQL from DB → schema diff**:
   ```bash
   TS=$(date +%Y%m%d%H%M%S)
   NAME="$1"   # e.g. "product_videos"
   DIR="/home/ubuntu/brilhodedivasite/prisma/migrations/${TS}_${NAME}"
   mkdir -p "$DIR"
   cd /home/ubuntu/brilhodedivasite
   npx prisma migrate diff \
     --from-config-datasource --to-schema prisma/schema.prisma --script 2>/dev/null \
     | grep -v "^◇" | grep -v "^Loaded Prisma" > "$DIR/migration.sql"
   ```

3. **Preview the SQL** — bail if it contains `DROP TABLE`, `DROP COLUMN`, or any destructive statement that would clobber data:
   ```bash
   cat "$DIR/migration.sql"
   grep -qE "^DROP |DROP TABLE|DROP COLUMN" "$DIR/migration.sql" && echo "REFUSE: destructive — ask user first"
   ```

4. **Apply the SQL directly** (bypasses Prisma's TTY requirement):
   ```bash
   PGPASSWORD=$(grep DATABASE_URL .env.local | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|') \
     psql -h 127.0.0.1 -U brilhodediva -d brilhodediva -f "$DIR/migration.sql"
   ```

5. **Record the migration as applied** so `prisma migrate deploy` stays in sync:
   ```bash
   CHECKSUM=$(sha256sum "$DIR/migration.sql" | cut -d' ' -f1)
   sudo -u postgres psql -d brilhodediva -c "
     INSERT INTO \"_prisma_migrations\" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, '$CHECKSUM', now(), '${TS}_${NAME}', now(), 1);"
   ```

6. **Regenerate the client**:
   ```bash
   npx prisma generate
   ```

7. **Verify** the table/columns exist:
   ```bash
   sudo -u postgres psql -d brilhodediva -c "\d+ <Table>"
   ```

## Don't
- Rerun `prisma migrate dev` — it'll refuse and show the same error every time.
- Edit `_prisma_migrations` to change a checksum; future diffs will mismatch.
- Skip step 5 — the DB works but `migrate deploy` on another env will try to reapply.

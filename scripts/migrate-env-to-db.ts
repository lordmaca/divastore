import { migrateEnvToDb } from "../lib/settings/migrate-env";

// One-shot migration CLI: copies legacy env-var config into SettingsKv.
// Idempotent. After it runs and `/admin/configuracoes` shows everything
// green with source="db", the env fallbacks in each adapter can be removed.

async function main() {
  const report = await migrateEnvToDb("bdd:migrate-env-to-db");

  const migratedSecrets = report.secrets.filter((s) => s.status === "migrated");
  const skippedDb = report.secrets.filter((s) => s.status === "skipped_already_in_db");
  const skippedEnv = report.secrets.filter((s) => s.status === "skipped_no_env");
  const migratedPlain = report.plain.filter((p) => p.status === "migrated");

  console.log("Secrets:");
  for (const s of migratedSecrets) {
    console.log(`  migrated      ${s.key} (from ${s.envVar})`);
  }
  for (const s of skippedDb) {
    console.log(`  already in db ${s.key}`);
  }
  for (const s of skippedEnv) {
    console.log(`  no env value  ${s.key}`);
  }

  console.log("Plain config:");
  for (const p of report.plain) {
    if (p.status === "migrated") {
      console.log(`  migrated      ${p.key} (${(p.mergedFields ?? []).join(", ")})`);
    } else if (p.status === "skipped_already_in_db") {
      console.log(`  already in db ${p.key}`);
    } else {
      console.log(`  no env value  ${p.key}`);
    }
  }

  console.log(
    `Summary: ${migratedSecrets.length} secrets + ${migratedPlain.length} plain configs copied.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

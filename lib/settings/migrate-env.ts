import { getSetting, setSetting, type SettingKey, type SettingValue } from "@/lib/settings";
import { getSecretStatus, setSecret, type SecretKey } from "@/lib/settings/config";

// One-shot migration: copy legacy env-var config into SettingsKv (plain +
// encrypted). Run once per environment after Phase C ships; after it lands,
// the env fallbacks can be deleted. Idempotent — re-running only writes keys
// that are still missing from the DB.

type SecretPlan = {
  key: SecretKey;
  envVars: string[]; // first non-empty wins
};

type PlainPlan<K extends SettingKey> = {
  key: K;
  envToValue: () => SettingValue<K> | null;
};

const SECRET_PLAN: SecretPlan[] = [
  { key: "email.smtp.user", envVars: ["EMAIL_SMTP_USER"] },
  { key: "email.smtp.pass", envVars: ["EMAIL_SMTP_PASS"] },
  { key: "mp.accessToken", envVars: ["MP_ACCESS_TOKEN"] },
  { key: "mp.webhookSecret", envVars: ["MP_WEBHOOK_SECRET"] },
  { key: "tiny.apiToken", envVars: ["TINY_API_TOKEN"] },
  { key: "tiny.webhookSecret", envVars: ["TINY_WEBHOOK_SECRET"] },
  { key: "melhorenvio.token", envVars: ["MELHORENVIO_TOKEN", "MELHORENVIO_ACCESS_TOKEN"] },
  { key: "melhorenvio.webhookSecret", envVars: ["MELHORENVIO_WEBHOOK_SECRET"] },
  { key: "divahub.apiKey", envVars: ["DIVAHUB_API_KEY"] },
  { key: "divahub.inboundApiKey", envVars: ["DIVAHUB_INBOUND_API_KEY"] },
  { key: "whatsapp.accessToken", envVars: ["WHATSAPP_ACCESS_TOKEN"] },
  { key: "s3.accessKeyId", envVars: ["S3_ACCESS_KEY_ID"] },
  { key: "s3.secretAccessKey", envVars: ["S3_SECRET_ACCESS_KEY"] },
];

function pickEnv(vars: string[]): string | null {
  for (const v of vars) {
    const val = process.env[v];
    if (val && val.trim()) return val;
  }
  return null;
}

export type MigrationReport = {
  actor: string;
  secrets: Array<{
    key: SecretKey;
    status: "migrated" | "skipped_already_in_db" | "skipped_no_env";
    envVar?: string;
  }>;
  plain: Array<{
    key: string;
    status: "migrated" | "skipped_already_in_db" | "skipped_no_env";
    mergedFields?: string[];
  }>;
};

export async function migrateEnvToDb(actor: string): Promise<MigrationReport> {
  const report: MigrationReport = { actor, secrets: [], plain: [] };

  // --- Secrets
  for (const plan of SECRET_PLAN) {
    const current = await getSecretStatus(plan.key);
    if (current.source === "db") {
      report.secrets.push({ key: plan.key, status: "skipped_already_in_db" });
      continue;
    }
    const envValue = pickEnv(plan.envVars);
    if (!envValue) {
      report.secrets.push({ key: plan.key, status: "skipped_no_env" });
      continue;
    }
    await setSecret(plan.key, envValue, actor);
    const matched = plan.envVars.find((v) => {
      const val = process.env[v];
      return Boolean(val && val.trim());
    });
    report.secrets.push({ key: plan.key, status: "migrated", envVar: matched });
  }

  // --- Plain configs: merge only empty fields from env, never overwrite DB
  // Email SMTP
  {
    const cur = await getSetting("email.smtp");
    const merged = { ...cur };
    const fields: string[] = [];
    if (!merged.host && process.env.EMAIL_SMTP_HOST) {
      merged.host = process.env.EMAIL_SMTP_HOST;
      fields.push("host");
    }
    if (!merged.port && process.env.EMAIL_SMTP_PORT) {
      const n = Number(process.env.EMAIL_SMTP_PORT);
      if (Number.isFinite(n) && n > 0) {
        merged.port = n;
        fields.push("port");
      }
    }
    if (!merged.from && process.env.EMAIL_FROM) {
      merged.from = process.env.EMAIL_FROM;
      fields.push("from");
    }
    if (!merged.replyTo && process.env.EMAIL_REPLY_TO) {
      merged.replyTo = process.env.EMAIL_REPLY_TO;
      fields.push("replyTo");
    }
    if (fields.length) {
      await setSetting("email.smtp", merged, actor);
      report.plain.push({ key: "email.smtp", status: "migrated", mergedFields: fields });
    } else {
      report.plain.push({ key: "email.smtp", status: "skipped_already_in_db" });
    }
  }

  // Tiny base URL
  {
    const cur = await getSetting("tiny.baseUrl");
    if (cur.url) {
      report.plain.push({ key: "tiny.baseUrl", status: "skipped_already_in_db" });
    } else if (process.env.TINY_API_BASE_URL) {
      await setSetting("tiny.baseUrl", { url: process.env.TINY_API_BASE_URL }, actor);
      report.plain.push({ key: "tiny.baseUrl", status: "migrated", mergedFields: ["url"] });
    } else {
      report.plain.push({ key: "tiny.baseUrl", status: "skipped_no_env" });
    }
  }

  // Melhor Envio env
  {
    const cur = await getSetting("melhorenvio.env");
    if (cur.env) {
      report.plain.push({ key: "melhorenvio.env", status: "skipped_already_in_db" });
    } else if (process.env.MELHORENVIO_ENV === "sandbox" || process.env.MELHORENVIO_ENV === "production") {
      await setSetting("melhorenvio.env", { env: process.env.MELHORENVIO_ENV }, actor);
      report.plain.push({ key: "melhorenvio.env", status: "migrated", mergedFields: ["env"] });
    } else {
      report.plain.push({ key: "melhorenvio.env", status: "skipped_no_env" });
    }
  }

  // DivaHub outbound URL
  {
    const cur = await getSetting("divahub.outbound");
    if (cur.url) {
      report.plain.push({ key: "divahub.outbound", status: "skipped_already_in_db" });
    } else if (process.env.DIVAHUB_API_URL) {
      await setSetting("divahub.outbound", { url: process.env.DIVAHUB_API_URL }, actor);
      report.plain.push({ key: "divahub.outbound", status: "migrated", mergedFields: ["url"] });
    } else {
      report.plain.push({ key: "divahub.outbound", status: "skipped_no_env" });
    }
  }

  // WhatsApp config (phoneNumberId only — apiVersion has a default)
  {
    const cur = await getSetting("whatsapp.config");
    const merged = { ...cur };
    const fields: string[] = [];
    if (!merged.phoneNumberId && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      merged.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      fields.push("phoneNumberId");
    }
    if (fields.length) {
      await setSetting("whatsapp.config", merged, actor);
      report.plain.push({ key: "whatsapp.config", status: "migrated", mergedFields: fields });
    } else {
      report.plain.push({ key: "whatsapp.config", status: "skipped_already_in_db" });
    }
  }

  // S3 config
  {
    const cur = await getSetting("s3.config");
    const merged = { ...cur };
    const fields: string[] = [];
    if (!merged.endpoint && process.env.S3_ENDPOINT) {
      merged.endpoint = process.env.S3_ENDPOINT;
      fields.push("endpoint");
    }
    if ((!merged.region || merged.region === "sa-saopaulo-1") && process.env.S3_REGION) {
      if (merged.region !== process.env.S3_REGION) {
        merged.region = process.env.S3_REGION;
        fields.push("region");
      }
    }
    if (!merged.publicBucket && process.env.S3_BUCKET) {
      merged.publicBucket = process.env.S3_BUCKET;
      fields.push("publicBucket");
    }
    if (!merged.privateBucket && process.env.S3_PRIVATE_BUCKET) {
      merged.privateBucket = process.env.S3_PRIVATE_BUCKET;
      fields.push("privateBucket");
    }
    if (!merged.prefix && process.env.S3_PREFIX) {
      merged.prefix = process.env.S3_PREFIX;
      fields.push("prefix");
    }
    if (!merged.publicBaseUrl && process.env.S3_PUBLIC_BASE_URL) {
      merged.publicBaseUrl = process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "");
      fields.push("publicBaseUrl");
    }
    if (fields.length) {
      await setSetting("s3.config", merged, actor);
      report.plain.push({ key: "s3.config", status: "migrated", mergedFields: fields });
    } else {
      report.plain.push({ key: "s3.config", status: "skipped_already_in_db" });
    }
  }

  return report;
}

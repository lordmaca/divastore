// Brilho de Diva — PM2 ecosystem.
// IMPORTANT: This file MUST NOT include the DivaHub apps. DivaHub is managed
// by its own ecosystem at ~/divahub/ecosystem.config.js. Never `pm2 save` from
// here without first verifying `divahub` and `divahub-scheduler` are still listed
// in `pm2 list`.

module.exports = {
  apps: [
    {
      name: "brilhodediva",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001 -H 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: { NODE_ENV: "production", PORT: "3001" },
      out_file: "/home/ubuntu/brilhodedivasite/logs/out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/err.log",
      time: true,
      autorestart: true,
    },
    {
      // Daily metric rollup. Runs nightly at 03:00 BRT (06:00 UTC).
      // Idempotent — re-running for the same day is safe.
      name: "brilhodediva-rollup",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "node_modules/.bin/tsx",
      args: "scripts/rollup-metrics.ts",
      autorestart: false,
      cron_restart: "0 6 * * *",
      env: { NODE_ENV: "production" },
      node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
      out_file: "/home/ubuntu/brilhodedivasite/logs/rollup-out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/rollup-err.log",
      time: true,
    },
    {
      // Retry sweeper for the Notification outbox. Runs every 5 minutes
      // and attempts to re-send FAILED rows (with exponential backoff of
      // 5m / 30m / 2h; capped at 3 attempts). Idempotent.
      name: "brilhodediva-notifications-retry",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "node_modules/.bin/tsx",
      args: "scripts/retry-notifications.ts",
      autorestart: false,
      cron_restart: "*/5 * * * *",
      env: { NODE_ENV: "production" },
      node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
      out_file: "/home/ubuntu/brilhodedivasite/logs/notif-retry-out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/notif-retry-err.log",
      time: true,
    },
    {
      // Category hygiene scan. Daily 04:00 BRT. Runs classifier over every
      // active product; auto-applies high-confidence mismatches (when the
      // setting is on) and opens CategoryAuditIssue rows for the rest.
      name: "brilhodediva-category-scan",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "node_modules/.bin/tsx",
      args: "scripts/scan-categories.ts",
      autorestart: false,
      cron_restart: "0 7 * * *",
      env: { NODE_ENV: "production" },
      node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
      out_file: "/home/ubuntu/brilhodedivasite/logs/category-scan-out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/category-scan-err.log",
      time: true,
    },
    {
      // NF-e poll sweeper. Every 5 minutes, checks Invoice rows in
      // REQUESTED state and asks Tiny for the latest SEFAZ situacao.
      // Promotes to ISSUED / FAILED / CANCELLED; fires the customer
      // `invoice_issued` email on successful emission.
      name: "brilhodediva-invoice-poll",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "node_modules/.bin/tsx",
      args: "scripts/poll-invoices.ts",
      autorestart: false,
      cron_restart: "*/5 * * * *",
      env: { NODE_ENV: "production" },
      node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
      out_file: "/home/ubuntu/brilhodedivasite/logs/invoice-poll-out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/invoice-poll-err.log",
      time: true,
    },
    {
      // Tiny ERP stock reconciliation. Every 30 minutes, fetches Tiny's
      // stock for every active-catalog SKU and aligns Variant.stock.
      // Aborts (and logs an IntegrationRun error) if >threshold% of active
      // SKUs would zero out in one run. See docs/tiny.md.
      name: "brilhodediva-tiny-stock-sync",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "node_modules/.bin/tsx",
      args: "scripts/sync-tiny-stock.ts",
      autorestart: false,
      cron_restart: "*/30 * * * *",
      env: { NODE_ENV: "production" },
      node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
      out_file: "/home/ubuntu/brilhodedivasite/logs/tiny-stock-out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/tiny-stock-err.log",
      time: true,
    },
    {
      // Daily backup. Tarball do working tree + dump do Postgres em
      // /home/ubuntu/backups + push pro GitHub (lordmaca/divastore).
      // Roda 03:00 BRT (06:00 UTC). Mantém últimos 14 snapshots locais.
      name: "brilhodediva-backup",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "/home/ubuntu/brilhodedivasite/scripts/bdd",
      args: "backup",
      interpreter: "bash",
      autorestart: false,
      cron_restart: "0 6 * * *",
      env: { NODE_ENV: "production", PATH: "/usr/local/bin:/usr/bin:/bin" },
      out_file: "/home/ubuntu/brilhodedivasite/logs/backup-out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/backup-err.log",
      time: true,
    },
    {
      // Abandoned-cart nudge. Runs every 30 minutes. Opt-in gated; sends
      // at most twice per cart (first at 4h idle, second at 24h if still).
      name: "brilhodediva-abandoned-cart",
      cwd: "/home/ubuntu/brilhodedivasite",
      script: "node_modules/.bin/tsx",
      args: "scripts/sweep-abandoned-carts.ts",
      autorestart: false,
      cron_restart: "*/30 * * * *",
      env: { NODE_ENV: "production" },
      node_args: "--env-file=/home/ubuntu/brilhodedivasite/.env.local",
      out_file: "/home/ubuntu/brilhodedivasite/logs/abandoned-cart-out.log",
      error_file: "/home/ubuntu/brilhodedivasite/logs/abandoned-cart-err.log",
      time: true,
    },
  ],
};

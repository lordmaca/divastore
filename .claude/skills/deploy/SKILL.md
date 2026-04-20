---
name: deploy
description: Rebuild the storefront, reload the PM2 app, and verify DivaHub + the storefront are healthy. Use after any change that would ship to production — new feature, bug fix, env change, schema migration. Refuses to proceed if the build fails or if DivaHub's site stops responding with 307.
---

# Deploy

## Why this exists
Every feature touches at least `npm run build && pm2 reload brilhodediva --update-env && safety check`. The safety check is the important part — we've almost broken DivaHub twice by forgetting to verify. This skill makes that check non-optional.

## Safe Harbor
- **NEVER** reload or stop the `divahub` / `divahub-scheduler` / `divahub-cleanup` PM2 apps.
- **NEVER** edit `/etc/nginx/sites-available/divahub` or its certbot cert.
- If `curl -I https://divahub.brilhodediva.com.br` returns anything other than 307 after our reload, **immediately** roll back and stop.

## Steps

1. **Pre-flight**: confirm we're in the storefront and DivaHub is healthy BEFORE we change anything.
   ```bash
   cd /home/ubuntu/brilhodedivasite
   curl -sS -o /dev/null -w "divahub PRE:  %{http_code}\n" https://divahub.brilhodediva.com.br
   pm2 list | grep -E "(brilhodediva|divahub)"
   ```
   If divahub is NOT 307, stop and investigate before touching anything.

2. **Build**:
   ```bash
   npm run build 2>&1 | tail -15
   ```
   Stop immediately if the build fails. Surface the first TypeScript error to the user.

3. **Reload**:
   ```bash
   pm2 reload brilhodediva --update-env
   sleep 3
   ```

4. **Post-flight — mandatory safety checks**:
   ```bash
   curl -sS -o /dev/null -w "divahub POST: %{http_code}\n" https://divahub.brilhodediva.com.br
   curl -sS --resolve loja.brilhodediva.com.br:443:163.176.244.199 \
     -o /dev/null -w "storefront:   %{http_code}\n" \
     https://loja.brilhodediva.com.br/api/health
   pm2 list | grep -E "(brilhodediva|divahub)"
   ```
   Required results:
   - DivaHub POST → 307 (unchanged)
   - Storefront health → 200
   - All 4+ PM2 apps in the list, `brilhodediva` online.

5. **If any check fails**, stop, surface the exact failure, and do NOT run `pm2 save`.

6. **Optional route smoke** (for UI changes):
   ```bash
   RESOLVE="--resolve loja.brilhodediva.com.br:443:163.176.244.199"
   H="https://loja.brilhodediva.com.br"
   for path in / /loja /loja/colar-laco-rose /carrinho /login /api/health; do
     code=$(curl -sS $RESOLVE -o /dev/null -w "%{http_code}" "$H$path")
     printf "%-32s %s\n" "$path" "$code"
   done
   ```

## Don't
- `pm2 save` before verifying DivaHub is still online and `pm2 list` still includes all DivaHub apps. We've been burned once.
- Skip the build step — reloading PM2 doesn't recompile Next. The app will run stale code.
- Skip the DivaHub PRE check — if DivaHub was already broken before you started, don't let the user think you caused it.

# Notifications — email now, WhatsApp next

All customer-facing messages go through `lib/notifications/` — an outbox-backed dispatcher that today routes to nodemailer and tomorrow routes to WhatsApp Cloud API without changing any call site.

## Architecture

```
trigger → enqueueAndSend({ channel, template, data })
            ↓
       Notification row (PENDING)
            ↓
       render(template, data) → { subject, html, text, marketing }
            ↓
       channel adapter (email | whatsapp)
            ↓
       Notification row (SENT | FAILED | SKIPPED)
            ↓
       sweep cron (every 5 min) retries FAILED rows
```

### Idempotency

`Notification` has `@@unique([orderId, template, channel])`. The dispatcher returns `null` on P2002 so repeated triggers never double-send the same transactional event.

### Retry

`scripts/retry-notifications.ts` runs every 5 minutes via PM2. It sweeps `FAILED` rows under the 3-attempt cap with exponential backoff (5m → 30m → 2h).

### LGPD gating

Every row's render output carries a `marketing: boolean` flag. The dispatcher re-checks `Customer.marketingOptIn` / `whatsappOptIn` **at send time** (not enqueue time) — a customer who opts out between enqueue and send gets `SKIPPED`, not sent.

Transactional templates (`order_created`, `payment_approved`, `payment_failed`, `order_shipped`, `order_delivered`, `welcome`, `password_reset`) bypass the opt-in check per LGPD art. 7º IX (legítimo interesse for contract execution).

Marketing templates (`abandoned_cart`) require opt-in.

## Configuration

SMTP host/port/from/reply-to and user/password are configured via `/admin/configuracoes → E-mail`. Credentials are encrypted (AES-256-GCM) in `SettingsKv`. WhatsApp lives under `/admin/configuracoes → WhatsApp` (stub today — see `whatsapp.md`). Edits take effect within 30 seconds (cache TTL) — no redeploy needed.

Shape on disk (reference only):

```
email.smtp            { host, port, from, replyTo? }       (plain)
email.smtp.user       encrypted secret
email.smtp.pass       encrypted secret
whatsapp.config       { phoneNumberId, apiVersion }        (plain)
whatsapp.accessToken  encrypted secret
```

If the SMTP config is incomplete the dispatcher marks rows `SKIPPED` with `lastError=email_not_configured` — no exceptions, checkout still works.

## Trigger points

| Event | Code path | Template |
|---|---|---|
| Signup | [app/(auth)/cadastro/page.tsx](../app/%28auth%29/cadastro/page.tsx) | `welcome` |
| Order created | [app/(shop)/checkout/actions.ts](../app/%28shop%29/checkout/actions.ts) | `order_created` |
| Payment approved | [app/api/webhooks/mercadopago/route.ts](../app/api/webhooks/mercadopago/route.ts) | `payment_approved` |
| Payment rejected / cancelled | same file | `payment_failed` |
| Order shipped | [lib/admin-actions.ts](../lib/admin-actions.ts) `markOrderShipped` | `order_shipped` |
| Order delivered | same file `markOrderDelivered` | `order_delivered` |
| Password reset request | [app/(auth)/recuperar-senha/page.tsx](../app/%28auth%29/recuperar-senha/page.tsx) | `password_reset` |
| Abandoned cart (4h idle) | [scripts/sweep-abandoned-carts.ts](../scripts/sweep-abandoned-carts.ts) | `abandoned_cart` |

## Pt-BR only

Every customer-facing template MUST be Brazilian Portuguese. See [`lib/notifications/templates/index.ts`](../lib/notifications/templates/index.ts) — all subjects and bodies are pt-BR. Dev-only log messages and error types stay in English.

## Testing locally

1. In `/admin/configuracoes → E-mail`, point the SMTP config at [Mailpit](https://github.com/axllent/mailpit) or [Mailtrap](https://mailtrap.io/) sandbox.
2. Trigger a flow (signup, checkout, reset).
3. Confirm delivery + inspect the `Notification` row:
   ```sql
   SELECT template, status, recipient, "lastError", "sentAt"
   FROM "Notification"
   ORDER BY "createdAt" DESC LIMIT 10;
   ```
4. Clear the SMTP password via the admin UI, trigger again, confirm status=FAILED, then restore it and run `./scripts/bdd retry` to see it retry.

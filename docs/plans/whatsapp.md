# WhatsApp Cloud API — integration roadmap

**Status:** architecture ready, adapter stubbed. See [`lib/notifications/channels/whatsapp.ts`](../../lib/notifications/channels/whatsapp.ts).

## Why the official Meta API, not Z-API

Z-API (WhatsApp Web automation) would ship in a day, but one policy change from Meta bans the account. Brilho de Diva's WhatsApp number is the primary customer channel — we won't bet the brand on unofficial automation. Meta Business Cloud API is higher-effort setup (1–2 weeks) with zero ban risk and official template gating.

## Timeline to production

1. **Business verification** (Meta Business Manager): 2–5 business days
   - Domain verification of `brilhodediva.com.br`
   - CNPJ documentation upload
2. **Phone number registration** (dedicated, not the owner's personal line): 1 day
   - Display name approval by Meta: up to 3 business days
3. **Template approval**: up to 24h per template (5 templates below = ~1 day if submitted in parallel)
4. **Adapter implementation**: ~1 day of code once credentials land

## Templates to submit

Each template maps 1:1 to an existing email template in [`lib/notifications/templates/`](../../lib/notifications/templates/). Locale: **pt_BR**. Category: **UTILITY** (transactional — no marketing category needed until we ship promotional blasts).

| Name (Meta) | Maps to | Variables |
|---|---|---|
| `order_created_br` | `order_created` | `{{1}}` name, `{{2}}` order number, `{{3}}` total |
| `payment_approved_br` | `payment_approved` | `{{1}}` name, `{{2}}` order number, `{{3}}` total, URL button |
| `payment_failed_br` | `payment_failed` | `{{1}}` name, `{{2}}` order number, retry URL button |
| `order_shipped_br` | `order_shipped` | `{{1}}` name, `{{2}}` order number, `{{3}}` carrier, `{{4}}` tracking code, URL button |
| `order_delivered_br` | `order_delivered` | `{{1}}` name, `{{2}}` order number, review URL button |

Pull the bodies directly from the `text` field of each template file — they were designed with Meta's template format in mind.

## Opt-in (LGPD)

Customer ticks the checkbox at checkout → `Customer.whatsappOptIn = true`.

**Double-confirm before any subsequent sends:** right after opt-in, send a utility message ("Olá! Você pediu para receber avisos do Brilho de Diva aqui — responda SIM para confirmar."). Store `whatsappOptInConfirmedAt` once they reply "SIM". Until confirmed, the dispatcher must skip WA sends for that customer.

Keywords to respect in the inbound webhook:
- `SIM` → confirm opt-in
- `SAIR` / `PARAR` / `CANCELAR` → set `whatsappOptIn = false`, `whatsappOptInAt = null`

## Env vars

```
WHATSAPP_ACCESS_TOKEN=<system-user or app token, non-expiring>
WHATSAPP_PHONE_NUMBER_ID=<numeric id from Meta Business Manager>
WHATSAPP_VERIFY_TOKEN=<random string for webhook verification>
```

## Webhook endpoint

Create `app/api/webhooks/whatsapp/route.ts`:
- `GET` handshake: return `hub.challenge` if `hub.verify_token === WHATSAPP_VERIFY_TOKEN`
- `POST` incoming: parse `entry[0].changes[0].value.messages`; react to opt-in keywords; store status events (`sent`, `delivered`, `read`, `failed`) against the matching `Notification` row by mapping `message_id`.

Add a `waMessageId` column on `Notification` to store the Meta message id for status updates.

## Adapter implementation outline

Replace the body of `sendWhatsApp` in `lib/notifications/channels/whatsapp.ts`:

```ts
const TEMPLATE_MAP: Record<string, string> = {
  order_created: "order_created_br",
  payment_approved: "payment_approved_br",
  payment_failed: "payment_failed_br",
  order_shipped: "order_shipped_br",
  order_delivered: "order_delivered_br",
};

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<void> {
  if (!whatsappConfigured()) throw new NotConfiguredError("whatsapp");
  const metaTemplate = TEMPLATE_MAP[msg.template];
  if (!metaTemplate) throw new NotConfiguredError(`whatsapp:${msg.template}`);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to,                   // E.164, no leading "+"
        type: "template",
        template: {
          name: metaTemplate,
          language: { code: "pt_BR" },
          components: buildComponents(msg.data), // positional params
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new TransportError("whatsapp", `${res.status}: ${body.slice(0, 200)}`);
  }
}
```

## What must NOT change on the existing codebase

The current stub intentionally throws `NotConfiguredError` — the dispatcher marks those rows `SKIPPED` (not `FAILED`), so WA failures don't crowd the retry cron. Do not change that contract. Only swap the function body.

All trigger call sites already pass `channel: NotificationChannel.WHATSAPP` when appropriate? **No — they don't yet.** Currently every trigger sends `NotificationChannel.EMAIL` only. When WA goes live, each trigger needs a second enqueue call gated on `Customer.whatsappOptIn`:

```ts
if (customer.whatsappOptIn && customer.whatsappOptInConfirmedAt) {
  await sendSafe({
    channel: NotificationChannel.WHATSAPP,
    template: "order_shipped",
    data: { ... },
    recipient: customer.phone!,  // must be E.164
    customerId, orderId,
  });
}
```

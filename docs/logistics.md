# Logistics — Melhor Envio labels + carrier webhooks

Melhor Envio is the aggregator we use for both quoting and label purchase. After a customer pays, the admin picks the right box/package, clicks "Comprar etiqueta" in the order detail, and the storefront:

1. Adds the shipment to the ME cart
2. Checks out (debits the ME account balance)
3. Generates the label PDF
4. Fetches the tracking code
5. Persists everything into a `Shipment` row and mirrors the tracking code back onto `Order` for backward compat

From that point on, tracking updates arrive via the signed `/api/webhooks/melhorenvio` endpoint and the customer gets `out_for_delivery` / `delivery_exception` / `order_delivered` emails automatically.

## Flow

```
PAID order                               Melhor Envio
   │                                        │
   │ admin "Comprar etiqueta"               │
   ├──────────────────────────────────────▶ │
   │  /me/cart                              │
   │  /me/shipment/checkout                 │
   │  /me/shipment/generate                 │
   │  /me/shipment/print   (PDF URL)        │
   │  /me/shipment/tracking (code)          │
   │                                        │
   ▼                                        │
 Shipment(row)  +  Order.trackingCode       │
                                            │
                                            │   carrier events
                                            ▼
                               POST /api/webhooks/melhorenvio
                                (HMAC-SHA256 signed)
                                            │
                                            ▼
                           Shipment.status updates
                           OrderEvent emissions
                           Order.status auto-transitions
                           Customer emails fire
```

## Env vars

```
MELHORENVIO_TOKEN             # Personal Access Token, sandbox or prod
MELHORENVIO_ENV               # "sandbox" (default) or "production"
MELHORENVIO_WEBHOOK_SECRET    # HMAC key — empty rejects all webhook POSTs (safe)
```

The token needs these scopes: `shipping-calculate`, `shipping-cart`, `shipping-checkout`, `shipping-generate`, `shipping-print`, `shipping-tracking`. Generate at **Configurações → Gerar Token**.

## Settings — `shipping.origin`

Set at `/admin/configuracoes`. Melhor Envio label purchase needs these:

- `cep, street, number, complement, district, city, state, recipient` (already used for quoting)
- **new for label purchase**: `phone`, `email`, `cnpj`

Without a valid origin, the orchestrator returns `{ok: false, reason: "origin_address_missing"}` before touching ME.

## Webhook shape

Melhor Envio pushes to `/api/webhooks/melhorenvio`:

```json
{
  "event": "shipment.status_updated",
  "data": {
    "id": "<me_shipment_id>",
    "status": "posted|in_transit|out_for_delivery|delivered|exception|returned|cancelled",
    "tracking": "BR123...",
    "description": "carrier note"
  }
}
```

Signature header is `x-melhorenvio-signature` (fallback: `x-signature`). HMAC-SHA256 of the raw body with `MELHORENVIO_WEBHOOK_SECRET`, hex or base64.

## Status mapping

| ME status | Our ShipmentStatus | Side-effects |
|---|---|---|
| `released` / `pending` | PURCHASED | — |
| `generated` | PRINTED | — |
| `posted` / `shipped` | POSTED | Order → SHIPPED; `SHIPPED` OrderEvent |
| `in_transit` | IN_TRANSIT | Order → SHIPPED |
| `out_for_delivery` | OUT_FOR_DELIVERY | `out_for_delivery` email |
| `delivered` | DELIVERED | Order → DELIVERED; `order_delivered` email |
| `exception` / `failure` | EXCEPTION | `delivery_exception` email |
| `returned` | RETURNED | — |
| `cancelled` | CANCELLED | — |

Unrecognized statuses are ignored — the webhook returns 200 with `{skipped: N}`.

## Operator runbook

```bash
# Check ME balance + confirm env before a big batch
./scripts/bdd env | grep MELHOR

# Buy label for a single order
./scripts/bdd label 42

# Inspect recent shipments
./scripts/bdd shipments 30

# Simulate a webhook locally (once MELHORENVIO_WEBHOOK_SECRET is set):
BODY='{"event":"shipment.status_updated","data":{"id":"abc123","status":"out_for_delivery","tracking":"BR000111222"}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$MELHORENVIO_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -X POST http://127.0.0.1:3001/api/webhooks/melhorenvio \
  -H "Content-Type: application/json" \
  -H "x-melhorenvio-signature: $SIG" \
  -d "$BODY"
```

## Failure modes

- **Insufficient ME balance**: `meCheckout` throws; orchestrator returns `me_checkout_error` and writes an `IntegrationRun(status=error)`. The Shipment row is NOT created, so retrying works once the balance is topped up.
- **Label generation still pending when we fetch print URL**: `labelUrl` ends up null; admin can refresh the order page a few seconds later (ME usually takes 2–5s). A future enhancement could add a poll job like the NF-e one.
- **Origin address incomplete**: caught pre-ME; operator fixes settings and retries.
- **Webhook missing**: if ME is configured to push but our endpoint rejects (bad signature or secret unset), tracking updates won't flow. The admin can still see the initial tracking code + label URL; the fallback is reading the customer's tracking URL directly.

---
name: divahub-push
description: Send a test product to our own DivaHub inbound endpoint to exercise the upsert pipeline (image mirror, video persistence, SEO fields, SKU linkage, JSON-LD). Use when debugging a contract change or validating a new field.
---

# DivaHub push

## Why this exists
We test the DivaHub inbound contract frequently — whenever we add a field (SEO, videos, shortName) or suspect an image/mirror bug. This skill formalizes the canonical test push so we can be sure we're exercising every surface.

## Safe Harbor
- Use our *own* `DIVAHUB_INBOUND_API_KEY` from `.env.local`, not DivaHub's outbound key.
- Test slugs always start with `teste-` so admin can easily filter them out.
- Never push against a slug that has a real customer order.

## Steps

1. **Load the key**:
   ```bash
   KEY=$(grep DIVAHUB_INBOUND_API_KEY /home/ubuntu/brilhodedivasite/.env.local \
     | cut -d'"' -f2 | cut -d',' -f1)
   ```

2. **Push a canonical test payload** (covers every documented field):
   ```bash
   RESOLVE="--resolve loja.brilhodediva.com.br:443:163.176.244.199"
   H="https://loja.brilhodediva.com.br"
   curl -sS $RESOLVE -X POST \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $KEY" \
     -d '{
       "externalId": "DH-TEST-'$(date +%s)'",
       "slug": "teste-contract",
       "name": "Teste de contrato completo DivaHub x Storefront",
       "shortName": "Teste Contrato",
       "description": "Produto de teste para validar o contrato DivaHub ↔ Storefront.\n\n✦ SEO\n✦ Imagens\n✦ Vídeos\n✦ SKU",
       "active": true,
       "category": { "slug": "testes", "name": "Testes" },
       "seoTitle": "Teste Contrato | Brilho de Diva",
       "seoDescription": "Descrição SEO para teste automatizado do contrato DivaHub.",
       "seoKeywords": ["teste", "contrato", "divahub"],
       "variants": [
         { "sku": "BD-TEST-'$(date +%s)'", "name": "Único", "priceCents": 5900, "stock": 3 }
       ],
       "images": [
         { "url": "https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=900", "alt": "teste", "position": 0 }
       ],
       "videos": [
         { "url": "https://youtu.be/dQw4w9WgXcQ", "source": "youtube", "kind": "reel" }
       ]
     }' "$H/api/integrations/divahub/products"
   ```

3. **Verify the upsert result**:
   - Expect `{"ok":true,"result":{...,"imagesReplaced":1}}`
   - On a follow-up push with the same slug: `created: false`, `variantsUpdated: 1`

4. **Verify persistence**:
   ```bash
   sudo -u postgres psql -d brilhodediva -c "
   SELECT p.slug, p.source, p.\"shortName\", p.\"seoTitle\",
          (SELECT COUNT(*) FROM \"Image\" WHERE \"productId\"=p.id) AS images,
          (SELECT COUNT(*) FROM \"ProductVideo\" WHERE \"productId\"=p.id) AS videos
   FROM \"Product\" p WHERE p.slug='teste-contract';"
   ```

5. **Verify image mirror** — the stored URL must be on our public base (`objectstorage.sa-saopaulo-1.oraclecloud.com`):
   ```bash
   sudo -u postgres psql -d brilhodediva -c "
   SELECT i.url FROM \"Image\" i JOIN \"Product\" p ON p.id=i.\"productId\"
   WHERE p.slug='teste-contract';"
   ```

6. **Verify PDP renders the full payload** end-to-end:
   ```bash
   RESOLVE="--resolve loja.brilhodediva.com.br:443:163.176.244.199"
   H="https://loja.brilhodediva.com.br"
   curl -sS $RESOLVE "$H/loja/teste-contract" \
     | grep -oE '"@type":"[^"]+"|aria-label="Vídeo"|aria-label="Imagem"|<title>[^<]+</title>' \
     | sort -u
   ```
   Expect: `Brand`, `BreadcrumbList`, `ListItem`, `Offer`, `Product`, `VideoObject`, and both `aria-label="Vídeo"` and `aria-label="Imagem"`.

## Don't
- Re-use `teste-phase-a` or other older test slugs — they have real images mirrored and could mask new bugs.
- Push the same slug with `source: MANUAL` expecting success — the storefront will 409 with `manual_product_collision` (intended behavior).

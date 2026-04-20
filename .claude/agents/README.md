# Brilho de Diva — Project Subagents

Ten specialized subagents for building and operating the Brilho de Diva storefront.

| Agent | Use for |
|---|---|
| [ecommerce-strategist](ecommerce-strategist.md) | Conversion, funnel, merchandising, post-purchase |
| [ui-designer](ui-designer.md) | Tailwind, brand system, glassmorphism, a11y |
| [marketing-copywriter](marketing-copywriter.md) | pt-BR copy, SEO meta, emails, social |
| [seo-specialist](seo-specialist.md) | Schema.org, sitemap, CWV, Merchant Center |
| [payments-engineer](payments-engineer.md) | Mercado Pago, webhooks, payment state machine |
| [erp-integrator](erp-integrator.md) | Tiny ERP orders/stock; future DivaHub API client |
| [architect](architect.md) | Module boundaries, integration contracts, trade-offs |
| [security-reviewer](security-reviewer.md) | LGPD, PCI scope, authz, webhook verification |
| [qa-e2e](qa-e2e.md) | Playwright journeys, Vitest, accessibility smoke |
| [devops](devops.md) | nginx, certbot, PM2, Postgres, deploys |

## Shared Safe Harbor (applies to every agent)

**The DivaHub project at `/home/ubuntu/divahub/` is out of scope and must not be modified.**

- Read-only reference is allowed.
- No writes, renames, moves, or deletes inside that directory.
- Do not stop, reload, or delete the `divahub` / `divahub-scheduler` PM2 apps.
- Do not edit DivaHub's nginx server block (`/etc/nginx/sites-available/divahub`) or its Let's Encrypt cert.
- Storefront uses **distinct** credentials (e.g. a separate `TINY_API_TOKEN`), separate Postgres DB, separate PM2 app on port **3001**, separate nginx server block for `www.brilhodediva.com.br`.
- If a task seems to require DivaHub-side changes, stop and ask the user — DivaHub work happens in its own repo.

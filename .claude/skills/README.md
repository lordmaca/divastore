# Project skills — Brilho de Diva storefront

Custom skills scoped to this repo. They encode workflows we've done repeatedly
that have non-obvious safety requirements (don't break DivaHub) or toolchain
quirks (Prisma 7 non-interactive migrations).

| Skill | Purpose |
|---|---|
| [migrate](migrate/SKILL.md) | Apply a Prisma schema change via the manual diff→SQL→apply pattern that actually works in this environment |
| [deploy](deploy/SKILL.md) | Build + PM2 reload + DivaHub safety check after any change |
| [divahub-push](divahub-push/SKILL.md) | End-to-end test of the DivaHub inbound contract (SEO, images, videos, SKU, JSON-LD) |

Invoke any of them by name when relevant — e.g. say "deploy" or "run the
deploy skill" after a feature change and the workflow runs.

## Safe harbor carryover

Every skill here inherits the repo-wide rule: **do not touch
`/home/ubuntu/divahub/` or its PM2 apps or its nginx/certbot config**. The
deploy skill's post-flight check (`curl -I https://divahub.brilhodediva.com.br`
must 307) exists to catch any accidental impact immediately.

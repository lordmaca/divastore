<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Key Next.js 16 deltas to remember:
- `params` and `searchParams` are `Promise<…>` — always `await`.
- `cookies()`, `headers()`, `draftMode()` are async — always `await`. Cookies can only be **set** in a Server Action or Route Handler, never in an RSC.
- The middleware file convention is **`proxy.ts`** (not `middleware.ts`). Edge runtime by default — keep Prisma/bcrypt/Node-only modules out of it.
- Turbopack is the default builder; webpack config triggers a build error.
<!-- END:nextjs-agent-rules -->

# Brilho de Diva — Storefront

Direct-to-consumer ecommerce site. Sister project to **DivaHub** (`/home/ubuntu/divahub`),
which handles content generation and marketplace publishing.

## ⚠ Safe Harbor — DivaHub is OFF LIMITS

`/home/ubuntu/divahub/` is a separate production service. **Never** modify, rename,
move, or delete anything inside it. Never restart its PM2 apps (`divahub`,
`divahub-scheduler`). Never edit `/etc/nginx/sites-available/divahub` or its
Let's Encrypt cert. After any nginx change, verify
`curl -I https://divahub.brilhodediva.com.br` still returns 200.

You MAY read DivaHub for reference (e.g. `lib/integration/tiny/` patterns).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Prisma 7 + PostgreSQL 16 (db: `brilhodediva`, role: `brilhodediva`) — uses the `@prisma/adapter-pg` driver adapter (Prisma 7 requires it; no Accelerate)
- NextAuth v5 (customer + admin) — split: `lib/auth-config.ts` is edge-safe and used by `proxy.ts`; `lib/auth.ts` adds the credentials provider for full server use
- Mercado Pago (Pix, Boleto, Card) — adapter has stub mode when `MP_ACCESS_TOKEN` unset
- Tiny ERP — orders out, **distinct API token** from DivaHub's; stub mode when `TINY_API_TOKEN` unset
- PM2 app `brilhodediva` on port **3001**, served at `https://loja.brilhodediva.com.br`

## Layout

- `app/` — App Router routes and API handlers
  - `(shop)/` — public storefront (home, /loja, /loja/[slug], /carrinho, /checkout)
  - `(auth)/` — `/login`, `/cadastro`
  - `(account)/` — `/minha-conta` (pedidos, favoritos)
  - `admin/` — admin area (integrations, pedidos, cupons, avaliações)
  - `api/` — health, NextAuth, MP webhook
  - `feeds/google.xml/` — Google Merchant Center product feed
- `components/` — UI components (incl. `admin/`)
- `lib/db.ts` — Prisma client singleton
- `lib/auth.ts` / `lib/auth-config.ts` — auth (split for edge)
- `lib/cart.ts` — `getCartReadOnly` (RSC) / `ensureCartWritable` (server actions)
- `lib/coupons.ts` / `lib/wishlist.ts` / `lib/reviews.ts` — feature libs
- `lib/integration/` — adapter modules (`tiny`, `mp`, `divahub`) + `registry.ts` + `publish-order.ts`
- `lib/rate-limit.ts` — in-memory token bucket (login)
- `lib/config.ts` — `SITE_URL` constant (override via `SITE_URL` env)
- `lib/generated/prisma/` — generated Prisma client (gitignored)
- `prisma/schema.prisma` — DB schema
- `proxy.ts` — Next 16 proxy (formerly middleware)
- `nginx/brilhodediva.conf` — nginx server block (deploy instructions inside)
- `ecosystem.config.js` — PM2 config (do **not** add divahub apps here)
- `.claude/agents/` — project subagents (each has its own Safe Harbor)

## Commands

```bash
npm run dev                            # local dev
npm run build                          # production build
PORT=3001 npm start                    # start prod server
npm run seed                           # seed sample catalog + admin user
npm run typecheck                      # tsc --noEmit
npx prisma migrate dev                 # create + apply migration
npx prisma studio                      # browse DB
curl http://127.0.0.1:3001/api/health  # health + integration status
```

## Deploy

```bash
npm run build && pm2 reload brilhodediva --update-env
curl -I https://divahub.brilhodediva.com.br   # MUST still 307 (proves DivaHub safe)
```

## Brand

Lavender → pink gradient bg, glassmorphism hero, cursive wordmark (Dancing Script),
Poppins body. Tokens in `app/globals.css`. Tagline: *"Realce sua Beleza, Brilhe como uma Diva!"*.

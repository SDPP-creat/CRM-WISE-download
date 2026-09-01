# Deploy na Cloudflare

Requisitos: conta Cloudflare, `npm install` já executado, e `npx wrangler login`
(ou `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` no ambiente).

Todos os comandos de `wrangler` abaixo rodam em `apps/api/`.

## 1. Criar os recursos

```bash
cd apps/api

# D1 (banco relacional + FTS5)
npx wrangler d1 create wise_news
# → copie "database_id" para [[d1_databases]] em wrangler.toml

# KV (cache, cursores, controle de coleta, rate limit)
npx wrangler kv namespace create KV
# → copie "id" para [[kv_namespaces]] em wrangler.toml

# R2 (snapshots e mídias permitidas)
npx wrangler r2 bucket create wise-news-snapshots

# Queues (pipeline + dead letter queue)
npx wrangler queues create wise-news-pipeline
npx wrangler queues create wise-news-dlq
```

Edite `apps/api/wrangler.toml` substituindo `REPLACE_WITH_D1_DATABASE_ID` e
`REPLACE_WITH_KV_ID` pelos valores retornados.

## 2. Migrations + seed

```bash
npx wrangler d1 migrations apply wise_news --remote
node ../../scripts/seed.mjs --remote      # cria fontes, tópicos, keywords, países e o admin
```

Defina o admin inicial via variáveis antes do seed (ou aceite os padrões e troque depois):

```bash
SEED_ADMIN_PHONE="+55..." SEED_ADMIN_PASSWORD="senha-forte" node ../../scripts/seed.mjs --remote
```

## 3. Segredos

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put REDDIT_CLIENT_ID
npx wrangler secret put REDDIT_CLIENT_SECRET
npx wrangler secret put REDDIT_USER_AGENT
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put STACKEXCHANGE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

Variáveis não-secretas (ex.: `ANTHROPIC_MODEL`) já estão em `[vars]` no `wrangler.toml`.

## 4. Publicar o Worker (API + cron + fila)

```bash
npx wrangler deploy
```

O cron (`*/15 * * * *` e varredura diária às 03:00 UTC) passa a disparar a coleta
automaticamente. Para testar antes: `npx wrangler dev` e chame `POST /api/admin/collect`
autenticado como admin.

## 5. Publicar o front (PWA)

O front é estático. Recomendado **Cloudflare Pages**:

```bash
cd ../web
# aponte para a URL pública da API em produção:
VITE_API_URL="https://wise-news-api.<sua-conta>.workers.dev" npm run build
npx wrangler pages deploy dist --project-name wise-news
```

Ou sirva `apps/web/dist/` em qualquer host estático. Ajuste CORS no Worker se o front
ficar em outro domínio (já habilitado por padrão com `credentials`).

## 6. Verificação pós-deploy

- `GET https://<api>/health` → `{ ok: true }`
- Login no front → **Admin → Coletar agora** → ver **Saúde dos coletores**.
- `GET /api/feed` deve listar notícias após a primeira coleta + processamento.

## Ícones PWA em PNG (opcional)

```bash
cd apps/web && npm i -D sharp && npm run gen:icons
```

Gera `icon-192.png`, `icon-512.png` e `apple-touch-icon.png` a partir de `public/icon.svg`.

<div align="center">

# WISE NEWS · Radar da API Oficial

**Central mundial de notícias e inteligência sobre a WhatsApp Business Platform**
(API Oficial · WABA · Cloud API · Meta Business · BSPs · limites · qualidade · verificação · bloqueios)

</div>

O WISE NEWS pesquisa continuamente fontes de vários países, organiza o conteúdo,
**traduz tudo para português do Brasil** e explica **o que cada informação pode mudar
na operação da Wise**. Cada notícia mostra **uma bandeira** (ou 🌐 Global), preserva o
original com atribuição/link, resume o autor e os comentaristas relevantes, verifica
entre fontes e termina com a **Análise da Wise**.

> ⚠️ Este repositório também contém o site estático de download do produto separado
> **CRM WISE** em [`apps/download-site/`](apps/download-site/) — preservado e intacto.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rodar localmente](#rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Fontes: o que já funciona e o que depende de credencial](#fontes)
- [Pipeline de coleta e processamento](#pipeline)
- [Testes, lint e build](#qualidade)
- [Deploy na Cloudflare](#deploy)
- [Limitações reais](#limitações-reais)
- [Documentação adicional](#documentação)

---

## Arquitetura

| Camada | Tecnologia |
|---|---|
| **Frontend (PWA)** | React 18 + TypeScript + Vite + Tailwind + `vite-plugin-pwa` |
| **Backend** | Cloudflare Workers + Hono (REST + SSE + Cron + Queue consumer) |
| **Dados** | D1 (SQLite) + FTS5 (busca textual) · KV (cache/cursores/rate-limit) · R2 (snapshots) · Queues (pipeline) + DLQ |
| **IA** | Camada independente de provedor; começa com Anthropic Claude (modelo configurável) |
| **Coleta** | Conectores independentes (Reddit, Stack Overflow, GitHub, RSS/Atom, Hacker News, Meta Status) |

Princípios: **nunca inventar** país, fonte, confirmação ou resumo; sem chave de IA a
coleta continua e o processamento fica `pending`; conteúdo sobre "farm" é tratado
apenas como **inteligência de risco**, nunca como tutorial de evasão.

## Estrutura do projeto

```
packages/
  shared/           # tipos, zod da IA, países/bandeiras, categorias, palavras-chave,
                    # detecção de país/idioma, dedup e pontuação de relevância
  database/         # migrations D1 (+FTS5) e gerador de seed
  source-adapters/  # interface comum + conectores (reddit, stackexchange, github, rss,
                    # hackernews, meta-status)
  ai/               # provedor de IA (Anthropic), prompt e validação do JSON estruturado
  ui/               # identidade visual (tokens) + logo/ícones SVG
apps/
  api/              # Worker: rotas REST, SSE, cron (coleta) e consumer da fila (pipeline)
  web/              # PWA mobile-first (feed, dossiê, busca, países, salvos, admin)
  download-site/    # site estático do CRM WISE (preservado)
tests/              # unit/integração (adaptadores, país/bandeira, dedup, relevância,
                    # validação de IA, API smoke) + fixtures anonimizadas
docs/               # deploy, adicionar fontes, arquitetura
scripts/seed.mjs    # seed do D1 (constantes + admin com hash PBKDF2)
```

## Rodar localmente

Pré-requisitos: **Node 20+** e npm 10+.

```bash
# 1) instalar dependências (workspaces)
npm install

# 2) configurar variáveis (mínimo para rodar)
cp .env.example apps/api/.dev.vars      # edite; sem chaves o app roda em modo limitado

# 3) criar o banco local (D1) e aplicar migrations + seed
cd apps/api
npx wrangler d1 migrations apply wise_news --local
cd ../..
SEED_ADMIN_PHONE="+5511999999999" SEED_ADMIN_PASSWORD="troque-isto" node scripts/seed.mjs --local

# 4) subir a API (Worker) e o front em dois terminais
npm run dev:api     # http://localhost:8787   (Hono no Workers runtime via wrangler)
npm run dev:web     # http://localhost:5173   (Vite; faz proxy de /api -> :8787)
```

Abra `http://localhost:5173`. Entre em **Perfil → Entrar** com o telefone/senha do seed
para acessar o **Painel administrativo** e disparar uma coleta imediata (**Coletar agora**).

> Sem `REDDIT_CLIENT_ID/SECRET` o conector do Reddit usa o feed público `.json`
> (best-effort). Sem `ANTHROPIC_API_KEY` as notícias são coletadas e publicadas com
> **análise pendente** (o sistema não inventa resumos).

## Variáveis de ambiente

Veja [`.env.example`](.env.example) para a lista completa e comentada. Resumo:

| Variável | Para quê | Sem ela |
|---|---|---|
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Análise da IA (tradução, país, resumos, análise Wise) | coleta segue, processamento `pending` |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` | OAuth do Reddit (mais estável e com limite maior) | usa feed público `.json` (limitado) |
| `GITHUB_TOKEN` | Aumenta o rate limit da busca de issues (60→5000/h) | funciona anônimo (limitado) |
| `STACKEXCHANGE_KEY` | Aumenta a cota do Stack Exchange | funciona sem key (cota menor) |
| `AUTH_SESSION_SECRET` | (Reservado) segredo de sessão | sessões usam token opaco em D1 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push | notificações ficam só in-app |
| `SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD` | Admin inicial criado no seed | usa valores padrão (troque!) |

Em produção, use `wrangler secret put <NOME>` (nunca comite segredos).

## Fontes

| Fonte | Conector | Funciona sem credencial? | Observação |
|---|---|---|---|
| **Reddit** | `reddit` | ✅ (feed público `.json`) | Melhor com OAuth (`REDDIT_CLIENT_ID/SECRET`) |
| **Stack Overflow** | `stackexchange` | ✅ | `STACKEXCHANGE_KEY` aumenta a cota |
| **GitHub** (Issues/Discussions) | `github` | ✅ (anônimo, limitado) | `GITHUB_TOKEN` recomendado |
| **Hacker News** | `hackernews` | ✅ (API Algolia) | — |
| **Meta / WhatsApp Status** | `meta-status` | ✅ | Ideal apontar para uma API Statuspage (`config.statuspageApi`) |
| **RSS/Atom** (changelog Meta, Infobip, blogs) | `rss` | ✅ | Requer uma `feedUrl` válida (configurar no admin) |

Classes de fonte (`official`, `partner/BSP`, `community`, `forum`, `individual`, `promo`)
são usadas na verificação — **um BSP nunca é tratado como fonte independente da Meta**.

## Pipeline

1. **Cron** (`*/15 * * * *` + varredura diária) chama o coletor, que respeita o
   **intervalo por fonte** (via KV) e registra cada execução em `crawl_runs`.
2. Cada post novo é normalizado, **deduplicado** (URL canônica → hash → similaridade de
   título) e enfileirado na **Queue**.
3. O consumer busca **comentários**, pontua **relevância**, roda a **IA** (JSON validado
   por zod) e persiste tradução, resumos, participantes, verificação, evidências e a
   **Análise da Wise**; falhas vão para `failed_jobs`/DLQ com retry e backoff.
4. O feed atualiza via **SSE** (`/api/stream`) sem recarregar a página.

## Qualidade

```bash
npm run lint         # ESLint (0 warnings)
npm test             # Vitest (unit + integração + API smoke)
npm run typecheck    # tsc -b em todo o monorepo
npm run build        # build de todos os pacotes + PWA
```

Estado atual: **lint 0**, **30 testes passando**, **typecheck ok**, **build ok**,
**Worker empacota** (`wrangler deploy --dry-run`), **migrations + seed** aplicam no D1 local.

## Deploy

Passo a passo completo em [`docs/DEPLOY.md`](docs/DEPLOY.md). Resumo:

```bash
cd apps/api
npx wrangler d1 create wise_news           # copie o database_id para wrangler.toml
npx wrangler kv namespace create KV        # copie o id para wrangler.toml
npx wrangler r2 bucket create wise-news-snapshots
npx wrangler queues create wise-news-pipeline
npx wrangler queues create wise-news-dlq
npx wrangler d1 migrations apply wise_news --remote
node ../../scripts/seed.mjs --remote
npx wrangler secret put ANTHROPIC_API_KEY  # e demais segredos
npx wrangler deploy
# front:
cd ../web && npm run build                 # publique dist/ (Cloudflare Pages)
```

## Limitações reais

- **Meta não expõe um changelog/status oficial padronizado e estável** para todas as
  regiões: o conector `meta-status` faz heurística de HTML por padrão; para produção,
  aponte-o a uma API Statuspage (`config.statuspageApi`) ou configure um feed RSS oficial.
- **Reddit sem OAuth** cai no feed público `.json`, sujeito a rate limit e bloqueios; o
  ideal é configurar as credenciais.
- **Web Push** exige chaves VAPID e serviço de envio; hoje o envio server-side é um ponto
  de extensão (as assinaturas já são coletadas e as notificações in-app já funcionam).
- **Ícones PWA**: são fornecidos em SVG (instalável em navegadores modernos). Para PNGs
  192/512/apple-touch, rode `npm run gen:icons` (requer `sharp`).
- O `fetchPost` de alguns conectores (GitHub) prioriza reprocesso a partir do `raw`
  salvo; a re-busca por id externo é parcial.
- Coleta responsável: prioriza APIs/RSS, respeita `robots.txt`/termos, não burla login,
  CAPTCHA ou anti-bot, e não republica texto completo quando a licença não permite.

## Documentação

- [`docs/DEPLOY.md`](docs/DEPLOY.md) — deploy na Cloudflare (D1/KV/R2/Queues/Cron/secrets).
- [`docs/ADDING_SOURCES.md`](docs/ADDING_SOURCES.md) — como adicionar novos fóruns/conectores.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — visão de dados e pipeline.

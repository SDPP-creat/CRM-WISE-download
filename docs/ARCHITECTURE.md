# Arquitetura — WISE NEWS

## Fluxo de dados

```
Cron (*/15 + diário)                         Queue (wise-news-pipeline)
        │                                              │
        ▼                                              ▼
 runCollection() ──enfileira──► fetch_comments ──► process_post ──► publica no feed
   │  respeita interval/fonte      │ pontua relevância   │ IA (JSON validado)   │
   │  cursores em KV               │ salva comentários   │ tradução/resumos     │  SSE /api/stream
   ▼                              ▼                     ▼ análise Wise          ▼
 crawl_runs                    comments             wise_analyses/...       apps/web
        │                                                   │
        └── posts (dedup: url canônica → hash → similaridade de título) ──► duplicate_clusters
```

Sem `ANTHROPIC_API_KEY`, `process_post` detecta país por heurística, publica com
`processing_status = 'pending'` e **não** gera resumos falsos.

## Componentes

- **`packages/shared`** — contrato único do sistema: tipos de domínio, schema zod da IA
  (validado antes de persistir), países/bandeiras, categorias, palavras-chave, e funções
  puras (detecção de país/idioma, canonicalização de URL, hash, similaridade, pontuação
  de relevância). É onde vivem as regras testáveis.
- **`packages/source-adapters`** — cada fonte implementa `SourceAdapter`
  (`validateConfig`, `fetchLatest`, `fetchPost`, `fetchComments`, `normalize`,
  `healthCheck`). `ctx.fetch` é injetável → testável com fixtures. `httpFetch` faz
  retry + backoff (respeita `Retry-After`).
- **`packages/ai`** — `AiProvider` (troca de provedor sem tocar no resto). Anthropic
  implementado: prompt com as regras, `extractJson` + `validateAnalysis` (zod),
  normalização de país e filtragem de tópicos, estimativa de custo/tokens.
- **`packages/database`** — migrations D1 (com FTS5) e `seedSql()` (gera SQL idempotente
  a partir das constantes compartilhadas).
- **`apps/api`** — Worker Hono. `fetch` (REST + SSE), `scheduled` (cron→coleta),
  `queue` (pipeline + DLQ). Autenticação por sessão (PBKDF2 + token opaco em D1) e
  papéis `admin`/`editor`/`reader`. Toda ação sensível grava `audit_logs`.
- **`apps/web`** — PWA mobile-first. Navegação inferior (Início/Buscar/Tópicos/Salvos/
  Perfil), feed com filtros + SSE, dossiê completo por notícia (original ↔ tradução,
  resumo do autor, participantes, conferência entre fontes, Análise da Wise) e painel
  admin (fontes, saúde, revisão, palavras, usuários, auditoria, custo de IA).

## Modelo de dados (resumo)

`users`, `sessions`, `sources`(+`source_configs`,`source_cursors`), `crawl_runs`,
`authors`, `posts`(+`post_versions`), `comments`(+`comment_versions`), `topics`+`post_topics`,
`keywords`, `countries`, `translations`, `summaries`, `participant_summaries`,
`wise_analyses`, `evidence_links`, `duplicate_clusters`, `bookmarks`, `alerts`,
`notifications`, `push_subscriptions`, `ai_usage`, `audit_logs`, `system_settings`,
`failed_jobs`, e a tabela virtual `posts_fts` (FTS5).

## Verificação e confiabilidade

Cada post tem `verification_status` (de `confirmed_official` a `rumor`/`promotional`/
`outdated`). Regras aplicadas pelo prompt e pela UI: documentação oficial > comentários;
BSP não é fonte independente da Meta; contradições são exibidas; nada é confirmado sem
rastreabilidade até uma fonte. Conteúdo de "farm" é tratado só como inteligência de risco.

# Adicionar novos fóruns / fontes

Há dois caminhos: (A) usar um **conector existente** só configurando no painel admin;
(B) criar um **novo conector** quando a fonte tem uma API/formato próprio.

## A) Nova fonte com conector existente (sem código)

No **Painel administrativo → Fontes → (nova fonte)** — ou via API `POST /api/admin/sources`
— informe `slug`, `name`, `connector` e `config`. Exemplos de `config` por conector:

- **reddit**: `{ "subreddits": ["WhatsappBusinessAPI","facebook"], "listing": "new", "limitPerSub": 25 }`
- **stackexchange**: `{ "site": "stackoverflow", "tags": ["whatsapp-cloud-api"], "pageSize": 30 }`
- **github**: `{ "queries": ["whatsapp cloud api in:title,body type:issue"] }`
- **hackernews**: `{ "query": "whatsapp business api", "minPoints": 5 }`
- **rss**: `{ "feedUrl": "https://exemplo.com/feed.xml", "sourceClassOverride": "official" }`
- **meta-status**: `{ "statuspageApi": "https://<statuspage>/api/v2/incidents.json" }`
  ou `{ "url": "https://metastatus.com/whatsapp-business-api" }` (heurística HTML).

Depois use **Testar conector** (valida config + saúde) e **Coletar agora**.
Ajuste a **frequência** (intervalo em minutos) por fonte.

A frequência efetiva também respeita o cron do Worker (mínimo prático: 15 min).

## B) Criar um novo conector (com código)

1. Crie `packages/source-adapters/src/<nome>.ts` implementando a interface
   [`SourceAdapter`](../packages/source-adapters/src/types.ts):

   ```ts
   import type { SourceAdapter, FetchLatestResult } from './types.js';
   export const meuAdapter: SourceAdapter = {
     kind: 'meu-conector',
     validateConfig(source) { /* checa source.config e source.secrets */ return { ok: true, errors: [] }; },
     async fetchLatest(source, ctx): Promise<FetchLatestResult> { /* usa ctx.fetch */ return { posts: [], cursors: {} }; },
     async fetchPost(source, externalId, ctx) { return null; },
     async fetchComments(source, externalId, ctx) { return []; },
     normalize(raw, source) { /* raw -> NormalizedPost */ return null; },
     async healthCheck(source, ctx) { return { ok: true, message: 'OK', checkedAt: new Date().toISOString() }; },
   };
   ```

   Regras importantes ao normalizar (`NormalizedPost`):
   - preserve `url` (link direto), `author`, `createdAt` (ISO), métricas e `links`;
   - defina `canonicalUrl` (use `canonicalizeUrl`) para ajudar a deduplicação;
   - **não** invente país nem idioma — a IA/heurística cuidam disso depois.

2. Registre em [`packages/source-adapters/src/index.ts`](../packages/source-adapters/src/index.ts):

   ```ts
   import { meuAdapter } from './meu-conector.js';
   export const ADAPTERS = { /* ... */ 'meu-conector': meuAdapter };
   ```

   E adicione `'meu-conector'` ao tipo `ConnectorKind` em
   [`packages/shared/src/sources.ts`](../packages/shared/src/sources.ts).

3. (Opcional) adicione uma entrada em `SOURCES` para o seed criar a fonte por padrão.

4. **Teste com fixtures anonimizadas** (sem depender da API externa) — veja
   [`tests/adapters.test.ts`](../tests/adapters.test.ts) e `tests/fixtures/`.
   Injete `ctx.fetch` com um mock que retorna a fixture.

5. Rode `npm run lint && npm test && npm run typecheck`.

## Palavras-chave e categorias

- **Palavras-chave** (multi-idioma, peso, negativas): Painel → **Palavras** (ou
  `POST /api/admin/keywords`). Semente inicial em
  [`packages/shared/src/keywords.ts`](../packages/shared/src/keywords.ts).
- **Categorias** visíveis: [`packages/shared/src/categories.ts`](../packages/shared/src/categories.ts).

## Boas práticas de coleta

Priorize API/RSS/sitemaps; respeite `robots.txt`, termos e rate limits; use backoff
(o helper `httpFetch` já reintenta em 429/5xx); não burle login/CAPTCHA/anti-bot; não
republique texto completo quando a licença não permitir — sempre mantenha atribuição e
link direto para a origem.

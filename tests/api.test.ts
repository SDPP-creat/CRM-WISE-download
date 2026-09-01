import { describe, it, expect } from 'vitest';
import worker from '../apps/api/src/index.js';
import { ftsQuery } from '../apps/api/src/db.js';
import { buildQuery } from '../apps/api/src/pipeline/questions.js';

// Env mínimo: /health e 404 não tocam no D1.
const env = {} as unknown as Parameters<typeof worker.fetch>[1];

describe('API (Hono) — smoke', () => {
  it('GET /health responde ok', async () => {
    const res = await worker.fetch(new Request('http://localhost/health'), env, {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('wise-news-api');
  });

  it('rota inexistente retorna 404 JSON', async () => {
    const res = await worker.fetch(new Request('http://localhost/nada'), env, {} as never);
    expect(res.status).toBe(404);
  });
});

describe('FTS query sanitize', () => {
  it('transforma termos em prefixos e limita', () => {
    expect(ftsQuery('WABA restricted')).toBe('waba* restricted*');
    expect(ftsQuery('   ')).toBe('""');
  });
});

describe('Perguntas — buildQuery', () => {
  it('extrai termos relevantes da pergunta (remove stopwords)', () => {
    const q = buildQuery('Como resolver meu WABA restrito após aprovar o nome de exibição?');
    expect(q).toContain('waba');
    expect(q).toContain('restrito');
    expect(q).not.toContain('como');
  });
});

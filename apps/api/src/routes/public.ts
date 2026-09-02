import { Hono } from 'hono';
import type { Env } from '../env.js';
import { queryFeed } from '../db.js';
import { CATEGORIES, flagEmoji, countryName } from '@wise-news/shared';

export const publicRoutes = new Hono<{ Bindings: Env }>();

/** Feed com filtros (país, categoria, classe da fonte, impacto, confiança, busca). */
publicRoutes.get('/feed', async (c) => {
  const q = c.req.query();
  const posts = await queryFeed(c.env.DB, {
    country: q.country,
    category: q.category,
    sourceClass: q.sourceClass,
    impact: q.impact,
    confidence: q.confidence,
    q: q.q,
    limit: Math.min(Number(q.limit) || 30, 100),
    offset: Number(q.offset) || 0,
  });
  return c.json({ posts, count: posts.length });
});

/** Busca global (usa FTS5). */
publicRoutes.get('/search', async (c) => {
  const term = c.req.query('q') ?? '';
  if (!term.trim()) return c.json({ posts: [], count: 0 });
  const posts = await queryFeed(c.env.DB, { q: term, limit: 50 });
  return c.json({ posts, count: posts.length });
});

/** Detalhe completo de uma notícia (dossiê). */
publicRoutes.get('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'id inválido' }, 400);
  const db = c.env.DB;

  const post = await db
    .prepare(
      `SELECT p.*, s.name AS source_name, s.source_class, s.connector, a.username AS author, a.location_hint AS author_location
       FROM posts p JOIN sources s ON s.id = p.source_id LEFT JOIN authors a ON a.id = p.author_id
       WHERE p.id = ? AND p.published = 1`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!post) return c.json({ error: 'Notícia não encontrada' }, 404);

  const [translation, summary, wise, participants, evidence, comments, related] = await Promise.all([
    db.prepare('SELECT * FROM translations WHERE post_id = ?').bind(id).first<Record<string, unknown>>(),
    db.prepare('SELECT * FROM summaries WHERE post_id = ?').bind(id).first<Record<string, unknown>>(),
    db.prepare('SELECT * FROM wise_analyses WHERE post_id = ?').bind(id).first<Record<string, unknown>>(),
    db.prepare('SELECT * FROM participant_summaries WHERE post_id = ? ORDER BY id').bind(id).all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM evidence_links WHERE post_id = ?').bind(id).all<Record<string, unknown>>(),
    db.prepare('SELECT c.*, a.username AS author FROM comments c LEFT JOIN authors a ON a.id = c.author_id WHERE c.post_id = ? AND c.is_relevant = 1 ORDER BY c.relevance_score DESC LIMIT 30').bind(id).all<Record<string, unknown>>(),
    post.cluster_id
      ? db.prepare('SELECT p.id, p.title, s.name AS source_name, p.url FROM posts p JOIN sources s ON s.id = p.source_id WHERE p.cluster_id = ? AND p.id != ?').bind(post.cluster_id, id).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] }),
  ]);

  const code = (post.country_code as string) ?? 'GLOBAL';
  return c.json({
    post: {
      ...post,
      flag: flagEmoji(code),
      country_name: countryName(code),
      media_urls: safeJson(post.media_urls),
      links: safeJson(post.links),
    },
    translation: translation ?? null,
    summary: summary ? { ...summary, attempts: safeJson(summary.attempts), evidence: safeJson(summary.evidence), open_questions: safeJson(summary.open_questions) } : null,
    wise_analysis: wise ? { ...wise, affected_areas: safeJson(wise.affected_areas), recommended_actions: safeJson(wise.recommended_actions), actions_to_avoid: safeJson(wise.actions_to_avoid) } : null,
    participants: participants.results ?? [],
    evidence: evidence.results ?? [],
    comments: comments.results ?? [],
    related: related.results ?? [],
  });
});

/** Categorias com contagem. */
publicRoutes.get('/categories', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT category_primary AS slug, COUNT(*) AS count FROM posts WHERE published = 1 AND category_primary IS NOT NULL GROUP BY category_primary')
    .all<{ slug: string; count: number }>();
  const counts = new Map((rows.results ?? []).map((r) => [r.slug, r.count]));
  return c.json({ categories: CATEGORIES.map((cat) => ({ ...cat, count: counts.get(cat.slug) ?? 0 })) });
});

/** Países com contagem + bandeira. */
publicRoutes.get('/countries', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT country_code AS code, COUNT(*) AS count FROM posts WHERE published = 1 AND country_code IS NOT NULL GROUP BY country_code ORDER BY count DESC')
    .all<{ code: string; count: number }>();
  return c.json({ countries: (rows.results ?? []).map((r) => ({ code: r.code, name: countryName(r.code), flag: flagEmoji(r.code), count: r.count })) });
});

/** Fontes públicas (sem segredos). */
publicRoutes.get('/sources', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT slug, name, connector, source_class, enabled FROM sources ORDER BY name')
    .all();
  return c.json({ sources: rows.results ?? [] });
});

/**
 * SSE: emite quando surgem novos posts publicados (poll leve no servidor).
 * O cliente reconecta automaticamente; envia o maior id conhecido via ?since=.
 */
publicRoutes.get('/stream', async (c) => {
  const encoder = new TextEncoder();
  let since = Number(c.req.query('since')) || 0;
  const db = c.env.DB;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`retry: 5000\n\n`));
      const started = Date.now();
      // Mantém a conexão por até ~50s (limite de wall-time do Worker).
      while (Date.now() - started < 50_000) {
        const row = await db.prepare('SELECT MAX(id) AS maxId FROM posts WHERE published = 1').first<{ maxId: number | null }>();
        const maxId = row?.maxId ?? 0;
        if (maxId > since) {
          const fresh = await queryFeed(db, { limit: 10 });
          const newOnes = fresh.filter((p) => p.id > since);
          if (newOnes.length) {
            controller.enqueue(encoder.encode(`event: posts\ndata: ${JSON.stringify(newOnes)}\n\n`));
          }
          since = maxId;
        } else {
          controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      controller.close();
    },
  });

  return new Response(stream as unknown as BodyInit, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
});

function safeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? [];
  try { return JSON.parse(value); } catch { return []; }
}

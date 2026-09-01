import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { AuthUser } from '../auth.js';
import { requireRole, hashPassword } from '../auth.js';
import { adapterSecrets } from '../env.js';
import { audit, loadSources } from '../db.js';
import { runCollection } from '../pipeline/collect.js';
import { enqueue } from '../pipeline/enqueue.js';
import { getAdapter, defaultContext } from '@wise-news/source-adapters';
import { providerFromEnv } from '@wise-news/ai';

type Vars = { Variables: { user: AuthUser }; Bindings: Env };
export const adminRoutes = new Hono<Vars>();

// admin + editor têm acesso; gerenciamento de usuários é admin-only (checado nos handlers).
adminRoutes.use('*', requireRole('admin', 'editor'));

// ---------------------------------------------------------------- Overview
adminRoutes.get('/overview', async (c) => {
  const db = c.env.DB;
  const [posts, pending, failed, review, sources, aiCost] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM posts').first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM posts WHERE processing_status = 'pending'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM posts WHERE processing_status = 'failed'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM posts WHERE processing_status = 'needs_review'").first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM sources WHERE enabled = 1').first<{ n: number }>(),
    db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS c, COALESCE(SUM(input_tokens+output_tokens),0) AS t FROM ai_usage WHERE created_at > datetime('now','-30 days')").first<{ c: number; t: number }>(),
  ]);
  const aiConfigured = Boolean(c.env.ANTHROPIC_API_KEY);
  return c.json({
    posts: posts?.n ?? 0, pending: pending?.n ?? 0, failed: failed?.n ?? 0, review: review?.n ?? 0,
    activeSources: sources?.n ?? 0, aiCost30d: aiCost?.c ?? 0, aiTokens30d: aiCost?.t ?? 0, aiConfigured,
  });
});

// ---------------------------------------------------------------- Sources
adminRoutes.get('/sources', async (c) => {
  const rows = await c.env.DB
    .prepare(`SELECT s.*, sc.config,
      (SELECT status FROM crawl_runs cr WHERE cr.source_id = s.id ORDER BY cr.started_at DESC LIMIT 1) AS last_status,
      (SELECT started_at FROM crawl_runs cr WHERE cr.source_id = s.id ORDER BY cr.started_at DESC LIMIT 1) AS last_run,
      (SELECT error FROM crawl_runs cr WHERE cr.source_id = s.id ORDER BY cr.started_at DESC LIMIT 1) AS last_error
      FROM sources s LEFT JOIN source_configs sc ON sc.source_id = s.id ORDER BY s.name`)
    .all();
  return c.json({ sources: rows.results ?? [] });
});

adminRoutes.post('/sources', async (c) => {
  const b = await c.req.json<{ slug: string; name: string; connector: string; sourceClass?: string; intervalMinutes?: number; config?: unknown }>();
  const res = await c.env.DB
    .prepare('INSERT INTO sources (slug, name, connector, source_class, interval_minutes, enabled) VALUES (?,?,?,?,?,1)')
    .bind(b.slug, b.name, b.connector, b.sourceClass ?? 'community', b.intervalMinutes ?? 60)
    .run();
  const id = res.meta.last_row_id as number;
  await c.env.DB.prepare('INSERT INTO source_configs (source_id, config) VALUES (?, ?)').bind(id, JSON.stringify(b.config ?? {})).run();
  await audit(c.env.DB, String(c.get('user').id), 'source_create', 'source', b.slug);
  return c.json({ ok: true, id });
});

adminRoutes.patch('/sources/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ name?: string; enabled?: boolean; intervalMinutes?: number; sourceClass?: string; config?: unknown }>();
  if (b.name !== undefined) await c.env.DB.prepare('UPDATE sources SET name=? WHERE id=?').bind(b.name, id).run();
  if (b.enabled !== undefined) await c.env.DB.prepare('UPDATE sources SET enabled=? WHERE id=?').bind(b.enabled ? 1 : 0, id).run();
  if (b.intervalMinutes !== undefined) await c.env.DB.prepare('UPDATE sources SET interval_minutes=? WHERE id=?').bind(b.intervalMinutes, id).run();
  if (b.sourceClass !== undefined) await c.env.DB.prepare('UPDATE sources SET source_class=? WHERE id=?').bind(b.sourceClass, id).run();
  if (b.config !== undefined) await c.env.DB.prepare('INSERT INTO source_configs (source_id, config) VALUES (?,?) ON CONFLICT(source_id) DO UPDATE SET config=excluded.config').bind(id, JSON.stringify(b.config)).run();
  await audit(c.env.DB, String(c.get('user').id), 'source_update', 'source', String(id), b);
  return c.json({ ok: true });
});

adminRoutes.delete('/sources/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM sources WHERE id = ?').bind(Number(c.req.param('id'))).run();
  await audit(c.env.DB, String(c.get('user').id), 'source_delete', 'source', c.req.param('id'));
  return c.json({ ok: true });
});

/** Testa o conector de uma fonte (healthCheck). */
adminRoutes.post('/sources/:slug/test', async (c) => {
  const slug = c.req.param('slug');
  const sources = await loadSources(c.env.DB, adapterSecrets(c.env), false);
  const source = sources.find((s) => s.slug === slug);
  if (!source) return c.json({ error: 'fonte não encontrada' }, 404);
  const adapter = getAdapter(source.connector);
  if (!adapter) return c.json({ error: 'conector inválido' }, 400);
  const validation = adapter.validateConfig(source);
  const health = await adapter.healthCheck(source, defaultContext({ fetch: fetch.bind(globalThis) }));
  return c.json({ validation, health });
});

/** Coleta imediata (todas as fontes ou uma). */
adminRoutes.post('/collect', async (c) => {
  const slug = c.req.query('slug');
  const result = await runCollection(c.env, { force: true, slug });
  await audit(c.env.DB, String(c.get('user').id), 'collect_now', 'source', slug ?? 'all', result);
  return c.json({ ok: true, ...result });
});

// ---------------------------------------------------------------- Collectors health / crawl runs
adminRoutes.get('/health', async (c) => {
  const rows = await c.env.DB
    .prepare(`SELECT s.slug, s.name, s.connector, s.enabled,
      cr.status, cr.started_at, cr.finished_at, cr.items_found, cr.items_new, cr.error, cr.latency_ms
      FROM sources s LEFT JOIN crawl_runs cr ON cr.id = (SELECT id FROM crawl_runs WHERE source_id = s.id ORDER BY started_at DESC LIMIT 1)
      ORDER BY s.name`)
    .all();
  return c.json({ collectors: rows.results ?? [] });
});

adminRoutes.get('/runs', async (c) => {
  const rows = await c.env.DB.prepare('SELECT cr.*, s.name AS source_name FROM crawl_runs cr JOIN sources s ON s.id = cr.source_id ORDER BY cr.started_at DESC LIMIT 100').all();
  return c.json({ runs: rows.results ?? [] });
});

// ---------------------------------------------------------------- Review queue & post editing
adminRoutes.get('/review', async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT p.id, p.title, p.processing_status, p.ai_error, p.created_at, s.name AS source_name FROM posts p JOIN sources s ON s.id = p.source_id WHERE p.processing_status IN ('needs_review','failed','pending') ORDER BY p.fetched_at DESC LIMIT 100")
    .all();
  return c.json({ posts: rows.results ?? [] });
});

/** Reprocessa uma notícia (reenfileira pipeline). */
adminRoutes.post('/posts/:id/reprocess', async (c) => {
  const id = Number(c.req.param('id'));
  await enqueue(c.env, { type: 'process_post', postId: id }, c.executionCtx.waitUntil.bind(c.executionCtx));
  await c.env.DB.prepare('UPDATE posts SET processing_status = ?, ai_error = NULL WHERE id = ?').bind('processing', id).run();
  await audit(c.env.DB, String(c.get('user').id), 'post_reprocess', 'post', String(id));
  return c.json({ ok: true });
});

/** Edita tradução, resumo, análise Wise, país, categoria, publicação. */
adminRoutes.patch('/posts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<Record<string, unknown>>();
  const db = c.env.DB;
  if (b.title_pt !== undefined) await db.prepare('INSERT INTO translations (post_id, title_pt) VALUES (?,?) ON CONFLICT(post_id) DO UPDATE SET title_pt=excluded.title_pt').bind(id, b.title_pt).run();
  if (b.short_summary !== undefined) await db.prepare('INSERT INTO summaries (post_id, short_summary) VALUES (?,?) ON CONFLICT(post_id) DO UPDATE SET short_summary=excluded.short_summary').bind(id, b.short_summary).run();
  if (b.country_code !== undefined) await db.prepare('UPDATE posts SET country_code=?, country_confidence=? WHERE id=?').bind(b.country_code, b.country_confidence ?? 'high', id).run();
  if (b.category_primary !== undefined) await db.prepare('UPDATE posts SET category_primary=? WHERE id=?').bind(b.category_primary, id).run();
  if (b.impact !== undefined) await db.prepare('UPDATE posts SET impact=? WHERE id=?').bind(b.impact, id).run();
  if (b.verification_status !== undefined) await db.prepare('UPDATE posts SET verification_status=? WHERE id=?').bind(b.verification_status, id).run();
  if (b.published !== undefined) await db.prepare('UPDATE posts SET published=? WHERE id=?').bind(b.published ? 1 : 0, id).run();
  if (b.wise_conclusion !== undefined) await db.prepare('INSERT INTO wise_analyses (post_id, conclusion) VALUES (?,?) ON CONFLICT(post_id) DO UPDATE SET conclusion=excluded.conclusion').bind(id, b.wise_conclusion).run();
  await audit(c.env.DB, String(c.get('user').id), 'post_edit', 'post', String(id), b);
  return c.json({ ok: true });
});

/** Aprovar / rejeitar publicação. */
adminRoutes.post('/posts/:id/approve', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare("UPDATE posts SET published = 1, processing_status = 'processed' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, String(c.get('user').id), 'post_approve', 'post', String(id));
  return c.json({ ok: true });
});
adminRoutes.post('/posts/:id/reject', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare("UPDATE posts SET published = 0, processing_status = 'rejected' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, String(c.get('user').id), 'post_reject', 'post', String(id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Keywords
adminRoutes.get('/keywords', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM keywords ORDER BY weight DESC, term').all();
  return c.json({ keywords: rows.results ?? [] });
});
adminRoutes.post('/keywords', async (c) => {
  const b = await c.req.json<{ term: string; lang?: string; weight?: number; topic?: string; negative?: boolean }>();
  await c.env.DB.prepare('INSERT OR IGNORE INTO keywords (term, lang, weight, topic, negative) VALUES (?,?,?,?,?)').bind(b.term, b.lang ?? 'en', b.weight ?? 1, b.topic ?? null, b.negative ? 1 : 0).run();
  return c.json({ ok: true });
});
adminRoutes.delete('/keywords/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM keywords WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Users (admin-only)
adminRoutes.get('/users', async (c) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Somente admin' }, 403);
  const rows = await c.env.DB.prepare('SELECT id, name, phone, role, active, created_at FROM users ORDER BY created_at DESC').all();
  return c.json({ users: rows.results ?? [] });
});
adminRoutes.post('/users', async (c) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Somente admin' }, 403);
  const b = await c.req.json<{ name: string; phone: string; password: string; role?: string }>();
  const { hash, salt } = await hashPassword(b.password);
  await c.env.DB.prepare('INSERT INTO users (name, phone, password_hash, password_salt, role) VALUES (?,?,?,?,?)').bind(b.name, b.phone, hash, salt, b.role ?? 'reader').run();
  await audit(c.env.DB, String(c.get('user').id), 'user_create', 'user', b.phone);
  return c.json({ ok: true });
});
adminRoutes.patch('/users/:id', async (c) => {
  if (c.get('user').role !== 'admin') return c.json({ error: 'Somente admin' }, 403);
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ role?: string; active?: boolean; password?: string }>();
  if (b.role !== undefined) await c.env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role, id).run();
  if (b.active !== undefined) await c.env.DB.prepare('UPDATE users SET active=? WHERE id=?').bind(b.active ? 1 : 0, id).run();
  if (b.password) { const { hash, salt } = await hashPassword(b.password); await c.env.DB.prepare('UPDATE users SET password_hash=?, password_salt=? WHERE id=?').bind(hash, salt, id).run(); }
  await audit(c.env.DB, String(c.get('user').id), 'user_update', 'user', String(id), { role: b.role, active: b.active });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Audit & AI usage
adminRoutes.get('/audit', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ logs: rows.results ?? [] });
});

adminRoutes.get('/ai-usage', async (c) => {
  const daily = await c.env.DB.prepare("SELECT date(created_at) AS day, SUM(cost_usd) AS cost, SUM(input_tokens+output_tokens) AS tokens, COUNT(*) AS calls FROM ai_usage GROUP BY day ORDER BY day DESC LIMIT 30").all();
  const total = await c.env.DB.prepare('SELECT COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(input_tokens+output_tokens),0) AS tokens FROM ai_usage').first();
  return c.json({ daily: daily.results ?? [], total });
});

/** Testa a IA. */
adminRoutes.post('/ai/test', async (c) => {
  const provider = providerFromEnv(c.env, fetch.bind(globalThis));
  if (!provider) return c.json({ ok: false, message: 'ANTHROPIC_API_KEY não configurada.' });
  const result = await provider.ping();
  return c.json(result);
});

// ---------------------------------------------------------------- Settings
adminRoutes.get('/settings', async (c) => {
  const rows = await c.env.DB.prepare('SELECT key, value FROM system_settings').all<{ key: string; value: string }>();
  const settings: Record<string, unknown> = {};
  for (const r of rows.results ?? []) { try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; } }
  return c.json({ settings });
});
adminRoutes.put('/settings/:key', async (c) => {
  const key = c.req.param('key');
  const b = await c.req.json<{ value: unknown }>();
  await c.env.DB.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(key, JSON.stringify(b.value)).run();
  await audit(c.env.DB, String(c.get('user').id), 'setting_update', 'setting', key, b.value);
  return c.json({ ok: true });
});

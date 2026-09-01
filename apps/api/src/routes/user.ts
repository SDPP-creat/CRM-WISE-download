import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { AuthUser } from '../auth.js';
import { requireRole } from '../auth.js';
import { queryFeed } from '../db.js';

type Vars = { Variables: { user: AuthUser }; Bindings: Env };
export const userRoutes = new Hono<Vars>();

userRoutes.use('*', requireRole('admin', 'editor', 'reader'));

// --- Bookmarks / Salvos ---
userRoutes.get('/bookmarks', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB
    .prepare('SELECT post_id FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC')
    .bind(user.id)
    .all<{ post_id: number }>();
  const ids = (rows.results ?? []).map((r) => r.post_id);
  if (ids.length === 0) return c.json({ posts: [] });
  // Reaproveita o feed e filtra pelos ids salvos.
  const posts = await queryFeed(c.env.DB, { limit: 100 });
  return c.json({ posts: posts.filter((p) => ids.includes(p.id)) });
});

userRoutes.post('/bookmarks/:postId', async (c) => {
  const user = c.get('user');
  const postId = Number(c.req.param('postId'));
  await c.env.DB.prepare('INSERT OR IGNORE INTO bookmarks (user_id, post_id) VALUES (?, ?)').bind(user.id, postId).run();
  return c.json({ ok: true });
});

userRoutes.delete('/bookmarks/:postId', async (c) => {
  const user = c.get('user');
  const postId = Number(c.req.param('postId'));
  await c.env.DB.prepare('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?').bind(user.id, postId).run();
  return c.json({ ok: true });
});

// --- Notificações ---
userRoutes.get('/notifications', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB
    .prepare('SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50')
    .bind(user.id)
    .all();
  return c.json({ notifications: rows.results ?? [] });
});

userRoutes.post('/notifications/:id/read', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)').bind(Number(c.req.param('id')), user.id).run();
  return c.json({ ok: true });
});

// --- Alertas ---
userRoutes.get('/alerts', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare('SELECT * FROM alerts WHERE user_id = ?').bind(user.id).all();
  return c.json({ alerts: rows.results ?? [] });
});

userRoutes.post('/alerts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ kind: string; filter?: unknown }>();
  await c.env.DB.prepare('INSERT INTO alerts (user_id, kind, filter) VALUES (?,?,?)').bind(user.id, body.kind, body.filter ? JSON.stringify(body.filter) : null).run();
  return c.json({ ok: true });
});

userRoutes.delete('/alerts/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), user.id).run();
  return c.json({ ok: true });
});

// --- Web Push ---
userRoutes.get('/push/key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY ?? null }));

userRoutes.post('/push/subscribe', async (c) => {
  const user = c.get('user');
  const sub = await c.req.json<{ endpoint: string; keys: { p256dh: string; auth: string } }>();
  if (!sub?.endpoint || !sub.keys) return c.json({ error: 'assinatura inválida' }, 400);
  await c.env.DB
    .prepare('INSERT OR IGNORE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)')
    .bind(user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth)
    .run();
  return c.json({ ok: true });
});

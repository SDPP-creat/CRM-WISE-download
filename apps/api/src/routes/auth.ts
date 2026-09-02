import { Hono } from 'hono';
import type { Env } from '../env.js';
import { createSession, resolveUser, getToken, verifyPassword } from '../auth.js';

export const authRoutes = new Hono<{ Bindings: Env }>();

/** Login por telefone + senha. Retorna cookie httpOnly + token. */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ phone?: string; password?: string }>().catch(() => ({}) as { phone?: string; password?: string });
  const { phone, password } = body;
  if (!phone || !password) return c.json({ error: 'Telefone e senha são obrigatórios.' }, 400);

  const user = await c.env.DB
    .prepare('SELECT id, name, phone, role, password_hash, password_salt FROM users WHERE phone = ? AND active = 1')
    .bind(phone)
    .first<{ id: number; name: string; phone: string; role: string; password_hash: string; password_salt: string }>();
  if (!user) return c.json({ error: 'Credenciais inválidas.' }, 401);

  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) return c.json({ error: 'Credenciais inválidas.' }, 401);

  const token = await createSession(c.env.DB, user.id, c.req.header('user-agent'));
  c.header('set-cookie', `wn_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${30 * 86400}; SameSite=Lax`);
  return c.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
});

authRoutes.post('/logout', async (c) => {
  const token = getToken(c);
  if (token) {
    const id = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  }
  c.header('set-cookie', 'wn_session=; HttpOnly; Path=/; Max-Age=0');
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const user = await resolveUser(c.env.DB, getToken(c));
  if (!user) return c.json({ user: null }, 200);
  return c.json({ user });
});

const encoder = new TextEncoder();
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

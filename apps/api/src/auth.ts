import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './env.js';
import type { UserRole } from '@wise-news/shared';

const encoder = new TextEncoder();

/** Deriva hash de senha com PBKDF2-SHA256 (WebCrypto, disponível no Worker). */
export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password) as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPassword(password: string, saltHex: string, expectedHash: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, expectedHash);
}

export async function createSession(db: D1Database, userId: number, userAgent?: string): Promise<string> {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const id = await sha256Hex(token);
  const expires = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)')
    .bind(id, userId, expires, userAgent ?? null)
    .run();
  return token;
}

export interface AuthUser {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
}

export async function resolveUser(db: D1Database, token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.phone, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1`,
    )
    .bind(id)
    .first<AuthUser>();
  return row ?? null;
}

export function getToken(c: Context): string | undefined {
  const auth = c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const cookie = c.req.header('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)wn_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** Middleware factory: exige usuário autenticado com um dos papéis. */
export function requireRole(...roles: UserRole[]) {
  return async (c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: () => Promise<void>) => {
    const user = await resolveUser(c.env.DB, getToken(c));
    if (!user) return c.json({ error: 'Não autenticado' }, 401);
    if (roles.length && !roles.includes(user.role)) return c.json({ error: 'Sem permissão' }, 403);
    c.set('user', user);
    await next();
  };
}

// --- helpers ---
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

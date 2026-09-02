import type { Env } from './env.js';

/**
 * Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) implementado com WebCrypto,
 * compatível com Cloudflare Workers. Envia notificações para a barra do celular
 * (Android/Chrome; iPhone só com o PWA instalado na tela inicial).
 */

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

/** Monta o cabeçalho Authorization VAPID (JWT ES256 + chave pública). */
async function vapidAuth(endpoint: string, env: Env): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || 'mailto:admin@wisenews.example',
  })));
  const signingInput = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', b64urlToBytes(env.VAPID_PRIVATE_KEY!) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(signingInput));
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, length * 8,
  );
  return new Uint8Array(bits);
}

/** Criptografa o payload no formato aes128gcm para uma inscrição. */
async function encryptPayload(payload: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh);
  const authSecret = b64urlToBytes(auth);

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  // RFC 8291: deriva o IKM a partir do segredo ECDH + auth.
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);

  // RFC 8188 (aes128gcm): CEK e NONCE.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const record = concat(enc.encode(payload), new Uint8Array([0x02])); // delimitador de último registro
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 }, aesKey, record as BufferSource));

  // Cabeçalho do corpo: salt(16) | rs(4) | idlen(1) | keyid(asPublic 65)
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ciphertext);
}

export interface PushMessage { title: string; body: string; url?: string; tag?: string }

/** Envia uma notificação para uma inscrição. Retorna o status HTTP do push service. */
export async function sendPush(env: Env, sub: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const body = await encryptPayload(JSON.stringify(msg), sub.p256dh, sub.auth);
  const auth = await vapidAuth(sub.endpoint, env);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: auth,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
    },
    body: body as BodyInit,
  });
  return res.status;
}

/** Envia para todas as inscrições; remove as expiradas (404/410). */
export async function sendPushToAll(env: Env, msg: PushMessage): Promise<{ sent: number; removed: number }> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, removed: 0 };
  const rows = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions').all<{ id: number; endpoint: string; p256dh: string; auth: string }>();
  let sent = 0;
  let removed = 0;
  for (const s of rows.results ?? []) {
    try {
      const status = await sendPush(env, s, msg);
      if (status === 404 || status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
        removed++;
      } else if (status >= 200 && status < 300) {
        sent++;
      }
    } catch (err) {
      console.warn('push falhou', s.endpoint, err);
    }
  }
  return { sent, removed };
}

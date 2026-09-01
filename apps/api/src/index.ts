import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import type { Env, PipelineJob } from './env.js';
import { publicRoutes } from './routes/public.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/user.js';
import { adminRoutes } from './routes/admin.js';
import { runCollection } from './pipeline/collect.js';
import { handleJob } from './pipeline/process.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin) => origin ?? '*',
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.get('/health', (c) => c.json({ ok: true, service: 'wise-news-api', time: new Date().toISOString() }));

app.route('/api', publicRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/me', userRoutes);
app.route('/api/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'Não encontrado' }, 404));
app.onError((err, c) => {
  console.error('Erro não tratado:', err);
  return c.json({ error: 'Erro interno' }, 500);
});

export default {
  fetch: app.fetch,

  /** Cron: dispara coleta respeitando o intervalo de cada fonte. */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const settings = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'collection_enabled'").first<{ value: string }>();
    if (settings && settings.value === 'false') return;
    const daily = event.cron === '0 3 * * *';
    ctx.waitUntil(runCollection(env, { force: daily }).then((r) => console.log('collection', r)).catch((e) => console.error('collection error', e)));
  },

  /** Consumidor da fila do pipeline (processamento + DLQ). */
  async queue(batch: MessageBatch<PipelineJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await handleJob(env, msg.body);
        msg.ack();
      } catch (err) {
        console.error('job falhou', msg.body, err);
        msg.retry();
      }
    }
  },
};

// Tipo mínimo do controller de cron (evita depender de lib DOM completa).
interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

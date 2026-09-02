import { Hono } from 'hono';
import type { Env } from '../env.js';
import type { AuthUser } from '../auth.js';
import { requireRole } from '../auth.js';
import { audit } from '../db.js';
import { enqueue } from '../pipeline/enqueue.js';

type Vars = { Variables: { user: AuthUser }; Bindings: Env };
export const questionRoutes = new Hono<Vars>();

questionRoutes.use('*', requireRole('admin', 'editor', 'reader'));

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/** Cria uma pergunta e dispara a agregação (busca ao vivo nos fóruns). */
questionRoutes.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  const text = (body.text ?? '').trim();
  if (text.length < 8) return c.json({ error: 'Escreva uma pergunta com pelo menos 8 caracteres.' }, 400);

  const res = await c.env.DB.prepare('INSERT INTO questions (user_id, text) VALUES (?, ?)').bind(user.id, text).run();
  const id = res.meta.last_row_id as number;
  await enqueue(c.env, { type: 'aggregate_question', questionId: id }, c.executionCtx.waitUntil.bind(c.executionCtx));
  await audit(c.env.DB, String(user.id), 'question_create', 'question', String(id));
  return c.json({ id });
});

/** Lista as perguntas do usuário. */
questionRoutes.get('/', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB
    .prepare('SELECT id, text, status, ai_status, answers_count, created_at, updated_at FROM questions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(user.id)
    .all();
  return c.json({ questions: rows.results ?? [] });
});

/** Detalhe: pergunta + respostas agrupadas por fórum + resposta combinada. */
questionRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const q = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ? AND user_id = ?').bind(id, user.id).first<Record<string, unknown>>();
  if (!q) return c.json({ error: 'Pergunta não encontrada' }, 404);

  const answers = await c.env.DB
    .prepare('SELECT id, forum, source_slug, source_class, post_id, author, title, excerpt, url, score, relevance, lang, created_at FROM question_answers WHERE question_id = ? ORDER BY relevance DESC, score DESC')
    .bind(id)
    .all<Record<string, unknown>>();

  // Agrupa por fórum
  const byForum: Record<string, Array<Record<string, unknown>>> = {};
  for (const a of answers.results ?? []) {
    const forum = String(a.forum);
    (byForum[forum] ??= []).push(a);
  }

  return c.json({
    question: {
      id: q.id, text: q.text, status: q.status, ai_status: q.ai_status,
      answers_count: q.answers_count, created_at: q.created_at, last_checked_at: q.last_checked_at,
      ai_answer: q.ai_answer ?? null,
      ai_confidence: q.ai_confidence ?? null,
      ai_per_source: parseJson(q.ai_per_source, [] as Array<{ forum: string; stance: string; note: string }>),
      ai_contradictions: parseJson(q.ai_contradictions, [] as string[]),
      ai_caveats: parseJson(q.ai_caveats, [] as string[]),
      ai_error: q.ai_error ?? null,
    },
    answers: answers.results ?? [],
    byForum,
    forums: Object.keys(byForum),
  });
});

/** Re-executa a agregação (buscar novas respostas). */
questionRoutes.post('/:id/refresh', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const q = await c.env.DB.prepare('SELECT id FROM questions WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!q) return c.json({ error: 'Pergunta não encontrada' }, 404);
  await enqueue(c.env, { type: 'aggregate_question', questionId: id }, c.executionCtx.waitUntil.bind(c.executionCtx));
  return c.json({ ok: true });
});

/** SSE: emite novas respostas e mudança de status da síntese, ao vivo. */
questionRoutes.get('/:id/stream', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const owns = await c.env.DB.prepare('SELECT id FROM questions WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!owns) return c.json({ error: 'Pergunta não encontrada' }, 404);

  const db = c.env.DB;
  const encoder = new TextEncoder();
  let sinceAnswer = Number(c.req.query('since')) || 0;
  let lastAiStatus = '';

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('retry: 5000\n\n'));
      const started = Date.now();
      while (Date.now() - started < 50_000) {
        const fresh = await db
          .prepare('SELECT id, forum, source_class, author, title, excerpt, url, score, relevance FROM question_answers WHERE question_id = ? AND id > ? ORDER BY id ASC')
          .bind(id, sinceAnswer)
          .all<Record<string, unknown>>();
        const list = fresh.results ?? [];
        if (list.length) {
          sinceAnswer = Number(list[list.length - 1].id);
          controller.enqueue(encoder.encode(`event: answers\ndata: ${JSON.stringify(list)}\n\n`));
        }
        const qrow = await db.prepare('SELECT ai_status, ai_answer, ai_confidence, ai_per_source, ai_contradictions, ai_caveats FROM questions WHERE id = ?').bind(id).first<Record<string, unknown>>();
        if (qrow && qrow.ai_status !== lastAiStatus) {
          lastAiStatus = String(qrow.ai_status);
          controller.enqueue(encoder.encode(`event: ai\ndata: ${JSON.stringify({
            ai_status: qrow.ai_status,
            ai_answer: qrow.ai_answer ?? null,
            ai_confidence: qrow.ai_confidence ?? null,
            ai_per_source: parseJson(qrow.ai_per_source, []),
            ai_contradictions: parseJson(qrow.ai_contradictions, []),
            ai_caveats: parseJson(qrow.ai_caveats, []),
          })}\n\n`));
          if (qrow.ai_status === 'done' || qrow.ai_status === 'failed') break;
        }
        controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
        await new Promise((r) => setTimeout(r, 4000));
      }
      controller.close();
    },
  });

  return new Response(stream as unknown as BodyInit, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
  });
});

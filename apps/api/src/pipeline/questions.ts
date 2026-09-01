import type { Env } from '../env.js';
import { adapterSecrets } from '../env.js';
import { getAdapter, defaultContext } from '@wise-news/source-adapters';
import type { NormalizedComment, NormalizedPost } from '@wise-news/shared';
import { jaccardSimilarity, commentSignals, relevanceScore, isNoiseComment } from '@wise-news/shared';
import { providerFromEnv } from '@wise-news/ai';
import { loadSources, ftsQuery, audit } from '../db.js';

const STOPWORDS = new Set(['como', 'para', 'qual', 'quais', 'que', 'the', 'and', 'with', 'what', 'how', 'why', 'when', 'meu', 'minha', 'está', 'está', 'sobre', 'uma', 'dos', 'das']);

/** Constrói uma consulta de busca a partir da pergunta em linguagem natural. */
export function buildQuery(text: string): string {
  const tokens = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .slice(0, 12);
  return tokens.join(' ') || text.slice(0, 120);
}

interface QuestionRow { id: number; text: string }

/** Job: agrega respostas dos fóruns (busca ao vivo) + do índice próprio. */
export async function aggregateQuestion(env: Env, questionId: number): Promise<void> {
  const question = await env.DB.prepare('SELECT id, text FROM questions WHERE id = ?').bind(questionId).first<QuestionRow>();
  if (!question) return;
  const query = buildQuery(question.text);
  const ctx = defaultContext({ fetch: fetch.bind(globalThis), logger: (m, e) => console.warn(`[q${questionId}] ${m}`, e ?? '') });
  const sources = await loadSources(env.DB, adapterSecrets(env), true);

  let added = 0;

  for (const source of sources) {
    const adapter = getAdapter(source.connector);
    if (!adapter?.search) continue;
    let matches: NormalizedPost[] = [];
    try {
      matches = await adapter.search(query, source, ctx);
    } catch (err) {
      ctx.logger?.(`search falhou em ${source.slug}`, err);
      continue;
    }
    const sourceRow = await env.DB.prepare('SELECT name FROM sources WHERE slug = ?').bind(source.slug).first<{ name: string }>();
    const forum = sourceRow?.name ?? source.slug;

    for (const match of matches.slice(0, 3)) {
      // Melhor "resposta": comentário/answer mais relevante; senão o próprio post.
      let excerpt = `${match.title}\n${match.body}`.trim();
      let author = match.author;
      let url = match.url;
      try {
        if (adapter.fetchComments) {
          const comments = await adapter.fetchComments(source, match.externalId, ctx);
          const best = pickBestAnswer(comments);
          if (best) {
            excerpt = best.body;
            author = best.author;
            url = best.url || match.url;
          }
        }
      } catch { /* sem comentários — usa o post */ }

      const relevance = Math.round(jaccardSimilarity(question.text, `${match.title} ${excerpt}`) * 100);
      const res = await env.DB
        .prepare(
          `INSERT OR IGNORE INTO question_answers
           (question_id, source_slug, forum, source_class, author, title, excerpt, url, score, relevance, lang, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          questionId, source.slug, forum, source.sourceClass, author, match.title,
          excerpt.slice(0, 2000), url, match.metrics.score ?? null, relevance, match.lang ?? null, match.createdAt,
        )
        .run();
      if (res.meta.changes) added++;
    }
  }

  // Também busca no índice próprio (posts já coletados) via FTS.
  try {
    const rows = await env.DB
      .prepare(
        `SELECT p.id, p.title, p.url, p.created_at, s.name AS forum, s.slug AS slug, s.source_class,
                COALESCE(t.title_pt, p.title) AS title_pt, sm.short_summary AS summary, a.username AS author
         FROM posts p JOIN posts_fts fts ON fts.rowid = p.id
         JOIN sources s ON s.id = p.source_id
         LEFT JOIN translations t ON t.post_id = p.id
         LEFT JOIN summaries sm ON sm.post_id = p.id
         LEFT JOIN authors a ON a.id = p.author_id
         WHERE p.published = 1 AND posts_fts MATCH ? LIMIT 8`,
      )
      .bind(ftsQuery(query))
      .all<{ id: number; title: string; url: string; created_at: string; forum: string; slug: string; source_class: string; title_pt: string; summary: string | null; author: string | null }>();
    for (const r of rows.results ?? []) {
      const excerpt = (r.summary || r.title_pt || r.title).slice(0, 2000);
      const relevance = Math.round(jaccardSimilarity(question.text, `${r.title} ${excerpt}`) * 100);
      const res = await env.DB
        .prepare(
          `INSERT OR IGNORE INTO question_answers
           (question_id, source_slug, forum, source_class, post_id, author, title, excerpt, url, relevance, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(questionId, r.slug, r.forum, r.source_class, r.id, r.author ?? null, r.title, excerpt, r.url, relevance, r.created_at)
        .run();
      if (res.meta.changes) added++;
    }
  } catch (err) {
    ctx.logger?.('busca no índice próprio falhou', err);
  }

  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM question_answers WHERE question_id = ?').bind(questionId).first<{ n: number }>();
  await env.DB
    .prepare("UPDATE questions SET answers_count = ?, last_checked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .bind(total?.n ?? 0, questionId)
    .run();

  await audit(env.DB, 'system', 'question_aggregated', 'question', String(questionId), { added, total: total?.n ?? 0 });

  // Encadeia a síntese por IA (se houver chave).
  await env.QUEUE.send({ type: 'synthesize_question', questionId });
}

function pickBestAnswer(comments: NormalizedComment[]): NormalizedComment | null {
  let best: NormalizedComment | null = null;
  let bestScore = -1;
  for (const c of comments) {
    if (isNoiseComment(c.body)) continue;
    const s = relevanceScore(commentSignals(c));
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

/** Job: sintetiza a resposta combinada citando cada fórum (requer IA). */
export async function synthesizeQuestion(env: Env, questionId: number): Promise<void> {
  const question = await env.DB.prepare('SELECT id, text FROM questions WHERE id = ?').bind(questionId).first<QuestionRow>();
  if (!question) return;

  const provider = providerFromEnv(env, fetch.bind(globalThis));
  if (!provider) {
    // Sem IA: mantém as respostas agrupadas; não sintetiza (não inventa).
    await env.DB.prepare("UPDATE questions SET ai_status = 'pending' WHERE id = ?").bind(questionId).run();
    return;
  }

  const rows = await env.DB
    .prepare('SELECT forum, author, excerpt, url, score FROM question_answers WHERE question_id = ? ORDER BY relevance DESC LIMIT 25')
    .bind(questionId)
    .all<{ forum: string; author: string | null; excerpt: string; url: string; score: number | null }>();
  const answers = (rows.results ?? []).map((r) => ({ forum: r.forum, author: r.author ?? 'anon', excerpt: r.excerpt, url: r.url, score: r.score ?? undefined }));

  if (answers.length === 0) {
    await env.DB.prepare("UPDATE questions SET ai_status = 'done', status = 'answered' WHERE id = ?").bind(questionId).run();
    return;
  }

  await env.DB.prepare("UPDATE questions SET ai_status = 'processing' WHERE id = ?").bind(questionId).run();
  try {
    const { result, usage } = await provider.answerQuestion({ question: question.text, answers });
    await env.DB
      .prepare(
        `UPDATE questions SET ai_answer = ?, ai_confidence = ?, ai_per_source = ?, ai_contradictions = ?, ai_caveats = ?,
         ai_status = 'done', status = 'answered', updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(
        result.answer_pt_br, result.confidence, JSON.stringify(result.per_source),
        JSON.stringify(result.contradictions), JSON.stringify(result.caveats), questionId,
      )
      .run();
    await env.DB
      .prepare('INSERT INTO ai_usage (provider, model, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?)')
      .bind(usage.provider, usage.model, usage.inputTokens, usage.outputTokens, usage.costUsd)
      .run();
  } catch (err) {
    await env.DB.prepare("UPDATE questions SET ai_status = 'failed', ai_error = ? WHERE id = ?").bind((err as Error).message, questionId).run();
    throw err;
  }
}

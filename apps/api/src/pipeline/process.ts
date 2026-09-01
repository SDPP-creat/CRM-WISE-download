import type { Env, PipelineJob } from '../env.js';
import { adapterSecrets } from '../env.js';
import { getAdapter, defaultContext } from '@wise-news/source-adapters';
import type { AiAnalysis } from '@wise-news/shared';
import {
  commentSignals,
  relevanceScore,
  isNoiseComment,
  RELEVANCE_THRESHOLD,
  detectCountry,
  categoryLabel,
  countryName,
} from '@wise-news/shared';
import { providerFromEnv } from '@wise-news/ai';
import { insertComments, syncFts, audit } from '../db.js';
import { aggregateQuestion, synthesizeQuestion } from './questions.js';
import { enqueue } from './enqueue.js';

interface PostRow {
  id: number; source_id: number; external_id: string; url: string; title: string; body: string;
  community: string | null; created_at: string; lang: string | null; connector: string;
  source_class: string; source_name: string; author: string; author_location: string | null;
  score: number | null; upvote_ratio: number | null; comment_count: number | null;
}

async function loadPost(env: Env, postId: number): Promise<PostRow | null> {
  return await env.DB
    .prepare(
      `SELECT p.id, p.source_id, p.external_id, p.url, p.title, p.body, p.community, p.created_at, p.lang,
              p.score, p.upvote_ratio, p.comment_count,
              s.connector, s.source_class, s.name AS source_name,
              a.username AS author, a.location_hint AS author_location
       FROM posts p JOIN sources s ON s.id = p.source_id LEFT JOIN authors a ON a.id = p.author_id
       WHERE p.id = ?`,
    )
    .bind(postId)
    .first<PostRow>();
}

/** Job 1: busca comentários, pontua relevância, agenda revisitas. */
export async function handleFetchComments(env: Env, postId: number): Promise<void> {
  const post = await loadPost(env, postId);
  if (!post) return;
  const adapter = getAdapter(post.connector);
  if (adapter) {
    try {
      const source = await buildSource(env, post);
      const ctx = defaultContext({ fetch: fetch.bind(globalThis) });
      const comments = await adapter.fetchComments(source, post.external_id, ctx);
      const relevantIds = new Set<string>();
      const scores = new Map<string, number>();
      for (const c of comments) {
        if (isNoiseComment(c.body)) continue;
        const s = relevanceScore(commentSignals(c));
        scores.set(c.externalId, s);
        if (s >= RELEVANCE_THRESHOLD) relevantIds.add(c.externalId);
      }
      await insertComments(env.DB, postId, post.source_id, comments, relevantIds, scores);
    } catch (err) {
      console.warn(`fetch_comments falhou post ${postId}`, err);
    }
  }
  // Encadeia o processamento por IA (fila ou inline).
  await enqueue(env, { type: 'process_post', postId });
}

/** Job 2: análise por IA (ou marca pending se não houver chave). */
export async function handleProcessPost(env: Env, postId: number): Promise<void> {
  const post = await loadPost(env, postId);
  if (!post) return;

  const provider = providerFromEnv(env, fetch.bind(globalThis));
  if (!provider) {
    // Sem IA: coleta segue, processamento pendente. NÃO inventa resumo.
    // Ainda assim detecta país por heurística e publica com status mínimo.
    const detection = detectCountry({ text: `${post.title}\n${post.body}`, authorLocationHint: post.author_location ?? undefined, sourceDomain: hostOf(post.url) });
    await env.DB
      .prepare('UPDATE posts SET country_code=?, country_confidence=?, country_reason=?, processing_status=?, published=1 WHERE id=?')
      .bind(detection.code, detection.confidence, detection.reason, 'pending', postId)
      .run();
    return;
  }

  await env.DB.prepare('UPDATE posts SET processing_status=? WHERE id=?').bind('processing', postId).run();

  try {
    const commentRows = await env.DB
      .prepare('SELECT a.username AS author, c.body, c.score, c.created_at FROM comments c LEFT JOIN authors a ON a.id = c.author_id WHERE c.post_id = ? ORDER BY c.relevance_score DESC LIMIT 40')
      .bind(postId)
      .all<{ author: string; body: string; score: number | null; created_at: string }>();

    const result = await provider.analyze({
      title: post.title,
      body: post.body,
      author: post.author ?? 'anon',
      sourceName: post.source_name,
      sourceClass: post.source_class,
      url: post.url,
      createdAt: post.created_at,
      sourceDomain: hostOf(post.url),
      authorLocationHint: post.author_location ?? undefined,
      metrics: { score: post.score ?? undefined, comments: post.comment_count ?? undefined },
      comments: (commentRows.results ?? []).map((c) => ({ author: c.author ?? 'anon', body: c.body, score: c.score ?? undefined, createdAt: c.created_at })),
    });

    await persistAnalysis(env, postId, result.analysis);

    // Registra uso de IA.
    await env.DB
      .prepare('INSERT INTO ai_usage (post_id, provider, model, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?,?)')
      .bind(postId, result.usage.provider, result.usage.model, result.usage.inputTokens, result.usage.outputTokens, result.usage.costUsd)
      .run();

    await maybeNotify(env, postId, result.analysis);
  } catch (err) {
    await env.DB.prepare('UPDATE posts SET processing_status=?, ai_error=? WHERE id=?').bind('failed', (err as Error).message, postId).run();
    await env.DB.prepare('INSERT INTO failed_jobs (job_type, payload, error, attempts) VALUES (?,?,?,1)').bind('process_post', JSON.stringify({ postId }), (err as Error).message).run();
    throw err; // deixa a Queue reintentar
  }
}

async function persistAnalysis(env: Env, postId: number, a: AiAnalysis): Promise<void> {
  const db = env.DB;
  const primary = a.topics[0] ?? 'whatsapp-business-api';
  const shortSummary = a.author_summary.problem?.slice(0, 240) || a.wise_analysis.conclusion.slice(0, 240);

  await db
    .prepare('UPDATE posts SET country_code=?, country_confidence=?, country_reason=?, category_primary=?, verification_status=?, impact=?, confidence=?, processing_status=?, published=1, processed_at=datetime(\'now\'), lang=? WHERE id=?')
    .bind(a.country.code, a.country.confidence, a.country.reason, primary, a.verification.status, a.wise_analysis.impact, a.wise_analysis.confidence, 'processed', a.original_language, postId)
    .run();

  await db.prepare('INSERT OR IGNORE INTO countries (code, name) VALUES (?, ?)').bind(a.country.code, a.country.name || countryName(a.country.code)).run();

  await db
    .prepare('INSERT INTO translations (post_id, lang_from, title_pt) VALUES (?,?,?) ON CONFLICT(post_id) DO UPDATE SET title_pt=excluded.title_pt, lang_from=excluded.lang_from')
    .bind(postId, a.original_language, a.translated_title)
    .run();

  await db
    .prepare('INSERT INTO summaries (post_id, short_summary, problem, attempts, result, evidence, open_questions) VALUES (?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET short_summary=excluded.short_summary, problem=excluded.problem, attempts=excluded.attempts, result=excluded.result, evidence=excluded.evidence, open_questions=excluded.open_questions')
    .bind(postId, shortSummary, a.author_summary.problem, JSON.stringify(a.author_summary.attempts), a.author_summary.result, JSON.stringify(a.author_summary.evidence), JSON.stringify(a.author_summary.open_questions))
    .run();

  await db
    .prepare('INSERT INTO wise_analyses (post_id, conclusion, affected_areas, impact, confidence, action_type, recommended_actions, actions_to_avoid, operational_risk, reasoning) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET conclusion=excluded.conclusion, affected_areas=excluded.affected_areas, impact=excluded.impact, confidence=excluded.confidence, action_type=excluded.action_type, recommended_actions=excluded.recommended_actions, actions_to_avoid=excluded.actions_to_avoid, operational_risk=excluded.operational_risk, reasoning=excluded.reasoning')
    .bind(postId, a.wise_analysis.conclusion, JSON.stringify(a.wise_analysis.affected_areas), a.wise_analysis.impact, a.wise_analysis.confidence, a.wise_analysis.action_type, JSON.stringify(a.wise_analysis.recommended_actions), JSON.stringify(a.wise_analysis.actions_to_avoid), a.wise_analysis.operational_risk, a.wise_analysis.reasoning)
    .run();

  // Tópicos
  await db.prepare('DELETE FROM post_topics WHERE post_id = ?').bind(postId).run();
  for (let i = 0; i < a.topics.length; i++) {
    const slug = a.topics[i];
    const topic = await db.prepare('SELECT id FROM topics WHERE slug = ?').bind(slug).first<{ id: number }>();
    if (topic) await db.prepare('INSERT OR IGNORE INTO post_topics (post_id, topic_id, is_primary) VALUES (?,?,?)').bind(postId, topic.id, i === 0 ? 1 : 0).run();
  }

  // Resumos de participantes (autor + comentaristas relevantes)
  await db.prepare('DELETE FROM participant_summaries WHERE post_id = ?').bind(postId).run();
  for (const rc of a.relevant_comments) {
    await db
      .prepare('INSERT INTO participant_summaries (post_id, author, role, original_excerpt, translation_pt, summary_pt, why_relevant, evidence_type) VALUES (?,?,?,?,?,?,?,?)')
      .bind(postId, rc.author, 'commenter', rc.original_excerpt, rc.translation_pt_br, rc.summary_pt_br, rc.why_relevant, rc.evidence_type)
      .run();
  }

  // Evidências (fontes de apoio + contradições)
  await db.prepare('DELETE FROM evidence_links WHERE post_id = ?').bind(postId).run();
  for (const url of a.verification.supporting_sources) {
    if (/^https?:\/\//.test(url)) await db.prepare('INSERT INTO evidence_links (post_id, url, kind) VALUES (?,?,?)').bind(postId, url, 'supporting').run();
  }
  for (const url of a.verification.contradictions) {
    if (/^https?:\/\//.test(url)) await db.prepare('INSERT INTO evidence_links (post_id, url, kind) VALUES (?,?,?)').bind(postId, url, 'contradiction').run();
  }

  await syncFts(db, postId, a.translated_title, '', a.translated_title, shortSummary);
  await audit(db, 'system', 'post_processed', 'post', String(postId), { category: categoryLabel(primary), impact: a.wise_analysis.impact });
}

/** Cria notificação (sem duplicar) para impacto alto/crítico ou mudança oficial. */
async function maybeNotify(env: Env, postId: number, a: AiAnalysis): Promise<void> {
  const highImpact = a.wise_analysis.impact === 'critical' || a.wise_analysis.impact === 'high';
  const official = a.verification.status === 'confirmed_official' || a.topics.includes('mudanca-oficial');
  if (!highImpact && !official) return;
  const dedupeKey = `post:${postId}`;
  await env.DB
    .prepare('INSERT OR IGNORE INTO notifications (user_id, post_id, title, body, kind, dedupe_key) VALUES (NULL, ?, ?, ?, ?, ?)')
    .bind(postId, a.translated_title, a.wise_analysis.conclusion.slice(0, 200), official ? 'official_change' : 'impact', dedupeKey)
    .run();
}

async function buildSource(env: Env, post: PostRow) {
  const cfgRow = await env.DB.prepare('SELECT config FROM source_configs WHERE source_id = ?').bind(post.source_id).first<{ config: string | null }>();
  return {
    slug: post.source_name,
    connector: post.connector as import('@wise-news/shared').ConnectorKind,
    sourceClass: post.source_class as import('@wise-news/shared').SourceClass,
    enabled: true,
    intervalMinutes: 60,
    config: cfgRow?.config ? JSON.parse(cfgRow.config) : {},
    secrets: adapterSecrets(env),
  };
}

function hostOf(url: string): string | undefined {
  try { return new URL(url).hostname; } catch { return undefined; }
}

/** Dispatcher da Queue. */
export async function handleJob(env: Env, job: PipelineJob): Promise<void> {
  switch (job.type) {
    case 'fetch_comments': return handleFetchComments(env, job.postId);
    case 'process_post': return handleProcessPost(env, job.postId);
    case 'aggregate_question': return aggregateQuestion(env, job.questionId);
    case 'synthesize_question': return synthesizeQuestion(env, job.questionId);
  }
}

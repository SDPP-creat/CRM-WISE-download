import type { D1Database } from '@cloudflare/workers-types';
import type {
  NormalizedComment,
  NormalizedPost,
  SourceRuntimeConfig,
  FeedPost,
} from '@wise-news/shared';
import {
  canonicalizeUrl,
  contentHash,
  flagEmoji,
  countryName,
  jaccardSimilarity,
} from '@wise-news/shared';

/** Camada de acesso a dados (D1). Mantém FTS e dedup em sincronia. */

export interface InsertPostResult {
  postId: number;
  isNew: boolean;
  duplicateOf?: number;
}

export async function upsertAuthor(db: D1Database, sourceId: number, username: string, locationHint?: string): Promise<number> {
  await db
    .prepare('INSERT OR IGNORE INTO authors (source_id, username, location_hint) VALUES (?, ?, ?)')
    .bind(sourceId, username, locationHint ?? null)
    .run();
  const row = await db
    .prepare('SELECT id FROM authors WHERE source_id = ? AND username = ?')
    .bind(sourceId, username)
    .first<{ id: number }>();
  return row!.id;
}

/** Detecta duplicidade por URL canônica, hash de conteúdo e similaridade de título. */
export async function findDuplicate(db: D1Database, np: NormalizedPost, hash: string): Promise<number | undefined> {
  const canonical = np.canonicalUrl ?? canonicalizeUrl(np.url);
  const byUrl = await db.prepare('SELECT id FROM posts WHERE canonical_url = ? LIMIT 1').bind(canonical).first<{ id: number }>();
  if (byUrl) return byUrl.id;
  const byHash = await db.prepare('SELECT id FROM posts WHERE content_hash = ? LIMIT 1').bind(hash).first<{ id: number }>();
  if (byHash) return byHash.id;
  // Similaridade de título entre posts recentes (janela de 14 dias).
  const recent = await db
    .prepare("SELECT id, title FROM posts WHERE created_at > datetime('now','-14 days') ORDER BY id DESC LIMIT 200")
    .all<{ id: number; title: string }>();
  for (const row of recent.results ?? []) {
    if (jaccardSimilarity(np.title, row.title) >= 0.82) return row.id;
  }
  return undefined;
}

export async function insertPost(
  db: D1Database,
  sourceId: number,
  np: NormalizedPost,
): Promise<InsertPostResult> {
  const existing = await db
    .prepare('SELECT id FROM posts WHERE source_id = ? AND external_id = ?')
    .bind(sourceId, np.externalId)
    .first<{ id: number }>();
  if (existing) return { postId: existing.id, isNew: false };

  const hash = contentHash(`${np.title}\n${np.body}`);
  const canonical = np.canonicalUrl ?? canonicalizeUrl(np.url);
  const dup = await findDuplicate(db, np, hash);
  const authorId = await upsertAuthor(db, sourceId, np.author, np.authorLocationHint);

  let clusterId: number | null = null;
  if (dup) {
    const dupRow = await db.prepare('SELECT cluster_id FROM posts WHERE id = ?').bind(dup).first<{ cluster_id: number | null }>();
    if (dupRow?.cluster_id) {
      clusterId = dupRow.cluster_id;
    } else {
      const res = await db
        .prepare('INSERT INTO duplicate_clusters (title, event_key, report_count) VALUES (?, ?, 2)')
        .bind(np.title, hash)
        .run();
      clusterId = res.meta.last_row_id as number;
      await db.prepare('UPDATE posts SET cluster_id = ? WHERE id = ?').bind(clusterId, dup).run();
    }
    await db.prepare('UPDATE duplicate_clusters SET report_count = report_count + 1, updated_at = datetime(\'now\') WHERE id = ?').bind(clusterId).run();
  }

  const res = await db
    .prepare(
      `INSERT INTO posts (
        source_id, author_id, external_id, url, canonical_url, content_hash,
        title, body, community, flair, lang, score, upvote_ratio, comment_count,
        media_urls, links, cluster_id, processing_status, raw, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      sourceId, authorId, np.externalId, np.url, canonical, hash,
      np.title, np.body, np.community ?? null, np.flair ?? null, np.lang ?? null,
      np.metrics.score ?? null, np.metrics.upvoteRatio ?? null, np.metrics.comments ?? null,
      JSON.stringify(np.mediaUrls ?? []), JSON.stringify(np.links ?? []),
      clusterId, 'pending', JSON.stringify(np.raw ?? null), np.createdAt, np.updatedAt ?? null,
    )
    .run();
  const postId = res.meta.last_row_id as number;

  await syncFts(db, postId, np.title, np.body, null, null);
  return { postId, isNew: true, duplicateOf: dup };
}

/** Sincroniza a linha na tabela FTS5 (contentless): apaga e reinsere. */
export async function syncFts(db: D1Database, postId: number, title: string, body: string, titlePt: string | null, summary: string | null): Promise<void> {
  try {
    await db.prepare("INSERT INTO posts_fts(posts_fts, rowid, title, body, title_pt, summary) VALUES('delete', ?, '', '', '', '')").bind(postId).run();
  } catch {
    // linha ainda não existia — ok
  }
  await db
    .prepare('INSERT INTO posts_fts(rowid, title, body, title_pt, summary) VALUES (?, ?, ?, ?, ?)')
    .bind(postId, title, body, titlePt ?? '', summary ?? '')
    .run();
}

export async function insertComments(db: D1Database, postId: number, sourceId: number, comments: NormalizedComment[], relevantIds: Set<string>, scores: Map<string, number>): Promise<number> {
  let inserted = 0;
  for (const c of comments) {
    const exists = await db.prepare('SELECT id FROM comments WHERE post_id = ? AND external_id = ?').bind(postId, c.externalId).first();
    if (exists) continue;
    const authorId = await upsertAuthor(db, sourceId, c.author);
    await db
      .prepare(
        `INSERT INTO comments (post_id, author_id, external_id, parent_external_id, body, score, url, is_reply, relevance_score, is_relevant, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        postId, authorId, c.externalId, c.parentExternalId ?? null, c.body, c.score ?? null,
        c.url, c.isReply ? 1 : 0, scores.get(c.externalId) ?? null, relevantIds.has(c.externalId) ? 1 : 0, c.createdAt,
      )
      .run();
    inserted++;
  }
  return inserted;
}

interface FeedRow {
  id: number; title: string; original_title: string; summary: string | null;
  category_primary: string | null; country_code: string | null; country_confidence: string | null;
  source_name: string; source_class: string; author: string; url: string;
  created_at: string; fetched_at: string; verification_status: string | null;
  impact: string | null; confidence: string | null; processing_status: string;
  lang: string | null; related_count: number; categories: string | null;
}

export interface FeedFilters {
  country?: string;
  category?: string;
  sourceClass?: string;
  impact?: string;
  confidence?: string;
  q?: string;
  onlyPublished?: boolean;
  limit?: number;
  offset?: number;
}

export async function queryFeed(db: D1Database, f: FeedFilters): Promise<FeedPost[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.onlyPublished !== false) where.push('p.published = 1');
  if (f.country) { where.push('p.country_code = ?'); binds.push(f.country); }
  if (f.category) { where.push('p.category_primary = ?'); binds.push(f.category); }
  if (f.sourceClass) { where.push('s.source_class = ?'); binds.push(f.sourceClass); }
  if (f.impact) { where.push('p.impact = ?'); binds.push(f.impact); }
  if (f.confidence) { where.push('p.confidence = ?'); binds.push(f.confidence); }

  let sql = `
    SELECT p.id, COALESCE(t.title_pt, p.title) AS title, p.title AS original_title,
      sm.short_summary AS summary, p.category_primary, p.country_code, p.country_confidence,
      s.name AS source_name, s.source_class, a.username AS author, p.url,
      p.created_at, p.fetched_at, p.verification_status, p.impact, p.confidence,
      p.processing_status, p.lang,
      COALESCE((SELECT report_count FROM duplicate_clusters dc WHERE dc.id = p.cluster_id), 1) AS related_count,
      (SELECT group_concat(tp2.topic_id) FROM post_topics tp2 WHERE tp2.post_id = p.id) AS categories
    FROM posts p
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN translations t ON t.post_id = p.id
    LEFT JOIN summaries sm ON sm.post_id = p.id`;

  if (f.q) {
    sql += ' JOIN posts_fts fts ON fts.rowid = p.id';
    where.push('posts_fts MATCH ?');
    binds.push(ftsQuery(f.q));
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  binds.push(f.limit ?? 30, f.offset ?? 0);

  const rows = await db.prepare(sql).bind(...binds).all<FeedRow>();
  return (rows.results ?? []).map(toFeedPost);
}

function toFeedPost(r: FeedRow): FeedPost {
  return {
    id: r.id,
    title: r.title,
    originalTitle: r.original_title,
    summary: r.summary ?? '',
    categoryPrimary: r.category_primary ?? '',
    categories: r.categories ? r.categories.split(',') : [],
    countryCode: r.country_code ?? 'GLOBAL',
    countryName: countryName(r.country_code),
    countryConfidence: (r.country_confidence as FeedPost['countryConfidence']) ?? null,
    flag: flagEmoji(r.country_code),
    sourceName: r.source_name,
    sourceClass: r.source_class as FeedPost['sourceClass'],
    author: r.author ?? 'anon',
    url: r.url,
    createdAt: r.created_at,
    fetchedAt: r.fetched_at,
    verificationStatus: r.verification_status as FeedPost['verificationStatus'],
    impact: r.impact as FeedPost['impact'],
    confidence: r.confidence as FeedPost['confidence'],
    relatedCount: r.related_count ?? 1,
    processingStatus: r.processing_status as FeedPost['processingStatus'],
    lang: r.lang,
  };
}

/** Sanitiza query do usuário para o MATCH do FTS5 (prefixo por token). */
export function ftsQuery(input: string): string {
  const tokens = (input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  if (tokens.length === 0) return '""';
  return tokens.map((t) => `${t}*`).join(' ');
}

export async function loadSources(db: D1Database, secrets: Record<string, string | undefined>, onlyEnabled = true): Promise<SourceRuntimeConfig[]> {
  const sql = `SELECT s.id, s.slug, s.connector, s.source_class, s.enabled, s.interval_minutes, c.config
               FROM sources s LEFT JOIN source_configs c ON c.source_id = s.id
               ${onlyEnabled ? 'WHERE s.enabled = 1' : ''}`;
  const rows = await db.prepare(sql).all<{ id: number; slug: string; connector: string; source_class: string; enabled: number; interval_minutes: number; config: string | null }>();
  return (rows.results ?? []).map((r) => ({
    slug: r.slug,
    connector: r.connector as SourceRuntimeConfig['connector'],
    sourceClass: r.source_class as SourceRuntimeConfig['sourceClass'],
    enabled: r.enabled === 1,
    intervalMinutes: r.interval_minutes,
    config: r.config ? JSON.parse(r.config) : {},
    secrets,
  }));
}

export async function sourceIdBySlug(db: D1Database, slug: string): Promise<number | null> {
  const row = await db.prepare('SELECT id FROM sources WHERE slug = ?').bind(slug).first<{ id: number }>();
  return row?.id ?? null;
}

export async function audit(db: D1Database, actor: string, action: string, entity?: string, entityId?: string, detail?: unknown): Promise<void> {
  await db
    .prepare('INSERT INTO audit_logs (actor, action, entity, entity_id, detail) VALUES (?,?,?,?,?)')
    .bind(actor, action, entity ?? null, entityId ?? null, detail ? JSON.stringify(detail) : null)
    .run();
}

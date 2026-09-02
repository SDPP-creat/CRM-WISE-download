import type { HealthCheckResult, NormalizedComment, NormalizedPost, SourceRuntimeConfig } from '@wise-news/shared';
import { canonicalizeUrl, detectLanguage } from '@wise-news/shared';
import { httpJson } from './http.js';
import type { FetchLatestResult, SourceAdapter } from './types.js';

const API = 'https://api.stackexchange.com/2.3';

interface SEItem {
  question_id: number;
  answer_id?: number;
  title?: string;
  body?: string;
  body_markdown?: string;
  link: string;
  score: number;
  answer_count?: number;
  view_count?: number;
  creation_date: number;
  last_activity_date?: number;
  tags?: string[];
  is_answered?: boolean;
  owner?: { display_name?: string; account_id?: number; location?: string };
}
interface SEResponse<T> { items: T[]; has_more: boolean; quota_remaining?: number }

function normalizeQuestion(item: SEItem, source: SourceRuntimeConfig): NormalizedPost | null {
  if (!item.question_id || !item.title) return null;
  const body = item.body_markdown ?? item.body ?? '';
  return {
    externalId: String(item.question_id),
    sourceSlug: source.slug,
    url: item.link,
    canonicalUrl: canonicalizeUrl(item.link),
    title: item.title,
    body,
    author: item.owner?.display_name ?? 'anon',
    authorLocationHint: item.owner?.location,
    community: (item.tags ?? []).join(','),
    createdAt: new Date(item.creation_date * 1000).toISOString(),
    updatedAt: item.last_activity_date ? new Date(item.last_activity_date * 1000).toISOString() : undefined,
    lang: detectLanguage(`${item.title}\n${body}`),
    metrics: { score: item.score, comments: item.answer_count, views: item.view_count },
    mediaUrls: [],
    links: Array.from(body.matchAll(/https?:\/\/[^\s)"']+/g)).map((m) => m[0]),
    raw: item,
  };
}

export const stackexchangeAdapter: SourceAdapter = {
  kind: 'stackexchange',

  validateConfig(source) {
    const errors: string[] = [];
    const tags = source.config.tags as string[];
    if (!Array.isArray(tags) || tags.length === 0) errors.push('config.tags deve ser uma lista não vazia.');
    return { ok: errors.length === 0, errors };
  },

  async fetchLatest(source, ctx): Promise<FetchLatestResult> {
    const site = (source.config.site as string) ?? 'stackoverflow';
    const tags = (source.config.tags as string[]) ?? [];
    const pageSize = (source.config.pageSize as number) ?? 30;
    const key = source.secrets.STACKEXCHANGE_KEY;
    const posts: NormalizedPost[] = [];
    for (const tag of tags) {
      const params = new URLSearchParams({
        order: 'desc', sort: 'creation', tagged: tag, site,
        filter: 'withbody', pagesize: String(pageSize),
      });
      if (key) params.set('key', key);
      try {
        const data = await httpJson<SEResponse<SEItem>>(`${API}/questions?${params}`, { fetchImpl: ctx.fetch });
        for (const item of data.items) {
          const np = normalizeQuestion(item, source);
          if (np) posts.push(np);
        }
      } catch (err) {
        ctx.logger?.(`stackexchange fetchLatest falhou na tag ${tag}`, err);
      }
    }
    return { posts, cursors: {} };
  },

  async fetchPost(source, externalId, ctx) {
    const site = (source.config.site as string) ?? 'stackoverflow';
    const key = source.secrets.STACKEXCHANGE_KEY;
    const params = new URLSearchParams({ site, filter: 'withbody' });
    if (key) params.set('key', key);
    const data = await httpJson<SEResponse<SEItem>>(`${API}/questions/${externalId}?${params}`, { fetchImpl: ctx.fetch });
    const item = data.items?.[0];
    return item ? normalizeQuestion(item, source) : null;
  },

  async fetchComments(source, externalId, ctx) {
    // "Comentários" = respostas da pergunta (mais úteis que os comments do SO).
    const site = (source.config.site as string) ?? 'stackoverflow';
    const key = source.secrets.STACKEXCHANGE_KEY;
    const params = new URLSearchParams({ site, filter: 'withbody', order: 'desc', sort: 'votes' });
    if (key) params.set('key', key);
    const data = await httpJson<SEResponse<SEItem>>(`${API}/questions/${externalId}/answers?${params}`, { fetchImpl: ctx.fetch });
    return (data.items ?? []).map((a): NormalizedComment => ({
      externalId: String(a.answer_id),
      postExternalId: externalId,
      author: a.owner?.display_name ?? 'anon',
      body: a.body_markdown ?? a.body ?? '',
      score: a.score,
      createdAt: new Date(a.creation_date * 1000).toISOString(),
      url: `https://stackoverflow.com/a/${a.answer_id}`,
      isReply: false,
    }));
  },

  async search(query, source, ctx) {
    const site = (source.config.site as string) ?? 'stackoverflow';
    const key = source.secrets.STACKEXCHANGE_KEY;
    const params = new URLSearchParams({ order: 'desc', sort: 'relevance', q: query, site, filter: 'withbody', pagesize: '15' });
    if (key) params.set('key', key);
    try {
      const data = await httpJson<SEResponse<SEItem>>(`${API}/search/advanced?${params}`, { fetchImpl: ctx.fetch });
      const out: NormalizedPost[] = [];
      for (const item of data.items ?? []) {
        const np = normalizeQuestion(item, source);
        if (np) out.push(np);
      }
      return out;
    } catch (err) {
      ctx.logger?.('stackexchange search falhou', err);
      return [];
    }
  },

  normalize(raw, source) {
    return normalizeQuestion(raw as SEItem, source);
  },

  async healthCheck(source, ctx): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const site = (source.config.site as string) ?? 'stackoverflow';
      const res = await ctx.fetch(`${API}/info?site=${site}`);
      return { ok: res.ok, message: res.ok ? 'OK' : `HTTP ${res.status}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    }
  },
};

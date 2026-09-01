import type { HealthCheckResult, NormalizedComment, NormalizedPost, SourceRuntimeConfig } from '@wise-news/shared';
import { canonicalizeUrl, detectLanguage } from '@wise-news/shared';
import { httpJson } from './http.js';
import type { FetchLatestResult, SourceAdapter } from './types.js';

const SEARCH = 'https://hn.algolia.com/api/v1/search_by_date';
const ITEM = 'https://hn.algolia.com/api/v1/items';

interface HnHit {
  objectID: string;
  title?: string;
  story_text?: string;
  url?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at: string;
}
interface HnItem {
  id: number;
  title?: string;
  text?: string;
  author?: string;
  points?: number;
  created_at: string;
  children?: HnItem[];
}

function normalizeHit(hit: HnHit, source: SourceRuntimeConfig): NormalizedPost | null {
  if (!hit.objectID || !hit.title) return null;
  const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const body = hit.story_text ?? '';
  return {
    externalId: hit.objectID,
    sourceSlug: source.slug,
    url: hnUrl,
    canonicalUrl: hit.url ? canonicalizeUrl(hit.url) : canonicalizeUrl(hnUrl),
    title: hit.title,
    body,
    author: hit.author ?? 'anon',
    createdAt: hit.created_at,
    lang: detectLanguage(`${hit.title}\n${body}`),
    metrics: { score: hit.points, comments: hit.num_comments },
    mediaUrls: [],
    links: hit.url ? [hit.url] : [],
    raw: hit,
  };
}

function collectComments(item: HnItem, postId: string, out: NormalizedComment[]): void {
  for (const child of item.children ?? []) {
    if (child.text) {
      out.push({
        externalId: String(child.id),
        postExternalId: postId,
        author: child.author ?? 'anon',
        body: child.text.replace(/<[^>]+>/g, ' '),
        score: child.points,
        createdAt: child.created_at,
        url: `https://news.ycombinator.com/item?id=${child.id}`,
        isReply: false,
      });
    }
    collectComments(child, postId, out);
  }
}

export const hackernewsAdapter: SourceAdapter = {
  kind: 'hackernews',

  validateConfig(source) {
    const errors: string[] = [];
    if (!source.config.query) errors.push('config.query é obrigatório.');
    return { ok: errors.length === 0, errors };
  },

  async fetchLatest(source, ctx): Promise<FetchLatestResult> {
    const query = (source.config.query as string) ?? 'whatsapp business api';
    const minPoints = (source.config.minPoints as number) ?? 0;
    const url = `${SEARCH}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=30`;
    const posts: NormalizedPost[] = [];
    try {
      const data = await httpJson<{ hits: HnHit[] }>(url, { fetchImpl: ctx.fetch });
      for (const hit of data.hits ?? []) {
        if ((hit.points ?? 0) < minPoints) continue;
        const np = normalizeHit(hit, source);
        if (np) posts.push(np);
      }
    } catch (err) {
      ctx.logger?.('hackernews fetchLatest falhou', err);
    }
    return { posts, cursors: {} };
  },

  async fetchPost(source, externalId, ctx) {
    const item = await httpJson<HnItem>(`${ITEM}/${externalId}`, { fetchImpl: ctx.fetch });
    if (!item?.title) return null;
    return normalizeHit({ objectID: String(item.id), title: item.title, story_text: item.text, author: item.author, points: item.points, created_at: item.created_at }, source);
  },

  async fetchComments(_source, externalId, ctx) {
    const out: NormalizedComment[] = [];
    try {
      const item = await httpJson<HnItem>(`${ITEM}/${externalId}`, { fetchImpl: ctx.fetch });
      collectComments(item, externalId, out);
    } catch { /* ignore */ }
    return out;
  },

  normalize(raw, source) {
    return normalizeHit(raw as HnHit, source);
  },

  async healthCheck(_source, ctx): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const res = await ctx.fetch(`${SEARCH}?query=test&hitsPerPage=1`);
      return { ok: res.ok, message: res.ok ? 'OK' : `HTTP ${res.status}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    }
  },
};

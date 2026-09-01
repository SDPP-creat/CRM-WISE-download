import type {
  HealthCheckResult,
  NormalizedComment,
  NormalizedPost,
  SourceRuntimeConfig,
} from '@wise-news/shared';
import { canonicalizeUrl, detectLanguage } from '@wise-news/shared';
import { httpJson } from './http.js';
import type { FetchContext, FetchLatestResult, SourceAdapter } from './types.js';

const OAUTH_BASE = 'https://oauth.reddit.com';
const PUBLIC_BASE = 'https://www.reddit.com';

interface RedditListing {
  data: { after: string | null; children: Array<{ kind: string; data: RedditThing }> };
}
interface RedditThing {
  id: string;
  name: string;
  permalink?: string;
  url?: string;
  title?: string;
  selftext?: string;
  body?: string;
  author?: string;
  subreddit?: string;
  link_flair_text?: string | null;
  created_utc?: number;
  edited?: number | boolean;
  score?: number;
  ups?: number;
  upvote_ratio?: number;
  num_comments?: number;
  parent_id?: string;
  replies?: RedditListing | '';
}

function userAgent(source: SourceRuntimeConfig): string {
  return source.secrets.REDDIT_USER_AGENT || 'wise-news/0.1 (+https://wisenews.example)';
}

async function getToken(source: SourceRuntimeConfig, ctx: FetchContext): Promise<string | null> {
  const id = source.secrets.REDDIT_CLIENT_ID;
  const secret = source.secrets.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  const basic = btoa(`${id}:${secret}`);
  const res = await ctx.fetch(`${PUBLIC_BASE}/api/v1/access_token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent(source),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

function normalizePost(thing: RedditThing, source: SourceRuntimeConfig): NormalizedPost | null {
  if (!thing.id || !thing.title) return null;
  const permalink = thing.permalink ? `${PUBLIC_BASE}${thing.permalink}` : (thing.url ?? '');
  const body = thing.selftext ?? '';
  const createdAt = new Date((thing.created_utc ?? 0) * 1000).toISOString();
  const editedAt = typeof thing.edited === 'number' && thing.edited > 0
    ? new Date(thing.edited * 1000).toISOString()
    : undefined;
  const links = Array.from(body.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]);
  return {
    externalId: thing.id,
    sourceSlug: source.slug,
    url: permalink,
    canonicalUrl: canonicalizeUrl(permalink),
    title: thing.title,
    body,
    author: thing.author ?? '[deleted]',
    community: thing.subreddit ? `r/${thing.subreddit}` : undefined,
    flair: thing.link_flair_text ?? undefined,
    createdAt,
    updatedAt: editedAt,
    lang: detectLanguage(`${thing.title}\n${body}`),
    metrics: {
      score: thing.score ?? thing.ups,
      upvoteRatio: thing.upvote_ratio,
      comments: thing.num_comments,
    },
    mediaUrls: thing.url && /\.(png|jpe?g|gif|webp|mp4)$/i.test(thing.url) ? [thing.url] : [],
    links,
    raw: thing,
  };
}

function flattenComments(listing: RedditListing | '' | undefined, postId: string, source: SourceRuntimeConfig, out: NormalizedComment[]): void {
  if (!listing || typeof listing === 'string') return;
  for (const child of listing.data.children) {
    if (child.kind !== 't1') continue;
    const c = child.data;
    if (!c.id || !c.body) continue;
    out.push({
      externalId: c.id,
      postExternalId: postId,
      parentExternalId: c.parent_id?.replace(/^t\d_/, ''),
      author: c.author ?? '[deleted]',
      body: c.body,
      score: c.score ?? c.ups,
      createdAt: new Date((c.created_utc ?? 0) * 1000).toISOString(),
      url: c.permalink ? `${PUBLIC_BASE}${c.permalink}` : `${PUBLIC_BASE}/comments/${postId}/_/${c.id}`,
      isReply: (c.parent_id ?? '').startsWith('t1_'),
    });
    if (c.replies) flattenComments(c.replies, postId, source, out);
    void source;
  }
}

export const redditAdapter: SourceAdapter = {
  kind: 'reddit',

  validateConfig(source) {
    const errors: string[] = [];
    const subs = (source.config.subreddits as string[]) ?? [];
    if (!Array.isArray(subs) || subs.length === 0) errors.push('config.subreddits deve ser uma lista não vazia.');
    if (!source.secrets.REDDIT_CLIENT_ID || !source.secrets.REDDIT_CLIENT_SECRET) {
      // Não é erro fatal: cai para o feed público .json (best-effort/limitado).
    }
    return { ok: errors.length === 0, errors };
  },

  async fetchLatest(source, ctx): Promise<FetchLatestResult> {
    const subs = (source.config.subreddits as string[]) ?? [];
    const listing = (source.config.listing as string) ?? 'new';
    const limit = (source.config.limitPerSub as number) ?? 25;
    const token = await getToken(source, ctx);
    const base = token ? OAUTH_BASE : PUBLIC_BASE;
    const posts: NormalizedPost[] = [];
    const cursors: Record<string, { cursor?: string; lastSeen?: string }> = { ...(ctx.cursors ?? {}) };

    for (const sub of subs) {
      const before = ctx.cursors?.[sub]?.lastSeen;
      const url = `${base}/r/${sub}/${listing}.json?limit=${limit}${before ? `&before=t3_${before}` : ''}`;
      try {
        const data = await httpJson<RedditListing>(url, {
          fetchImpl: ctx.fetch,
          headers: {
            'user-agent': userAgent(source),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        });
        let newest: string | undefined;
        for (const child of data.data.children) {
          if (child.kind !== 't3') continue;
          const np = normalizePost(child.data, source);
          if (!np) continue;
          if (!newest) newest = np.externalId;
          posts.push(np);
        }
        cursors[sub] = { lastSeen: newest ?? ctx.cursors?.[sub]?.lastSeen };
      } catch (err) {
        ctx.logger?.(`reddit fetchLatest falhou em r/${sub}`, err);
      }
    }
    return { posts, cursors };
  },

  async fetchPost(source, externalId, ctx) {
    const token = await getToken(source, ctx);
    const base = token ? OAUTH_BASE : PUBLIC_BASE;
    const data = await httpJson<RedditListing[]>(`${base}/comments/${externalId}.json?limit=1`, {
      fetchImpl: ctx.fetch,
      headers: { 'user-agent': userAgent(source), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    const thing = data?.[0]?.data?.children?.[0]?.data;
    return thing ? normalizePost(thing, source) : null;
  },

  async fetchComments(source, externalId, ctx) {
    const token = await getToken(source, ctx);
    const base = token ? OAUTH_BASE : PUBLIC_BASE;
    const data = await httpJson<RedditListing[]>(`${base}/comments/${externalId}.json?limit=100&depth=3&sort=top`, {
      fetchImpl: ctx.fetch,
      headers: { 'user-agent': userAgent(source), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    const out: NormalizedComment[] = [];
    if (Array.isArray(data) && data[1]) flattenComments(data[1], externalId, source, out);
    return out;
  },

  async search(query, source, ctx) {
    const token = await getToken(source, ctx);
    const base = token ? OAUTH_BASE : PUBLIC_BASE;
    // Restringe a busca aos subreddits monitorados (se houver) para reduzir ruído.
    const subs = (source.config.subreddits as string[]) ?? [];
    const restrict = subs.length ? `&restrict_sr=on` : '';
    const scope = subs.length ? `/r/${subs.slice(0, 8).join('+')}` : '';
    const url = `${base}${scope}/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=year&limit=15${restrict}`;
    try {
      const data = await httpJson<RedditListing>(url, {
        fetchImpl: ctx.fetch,
        headers: { 'user-agent': userAgent(source), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      const out: NormalizedPost[] = [];
      for (const child of data.data.children) {
        if (child.kind !== 't3') continue;
        const np = normalizePost(child.data, source);
        if (np) out.push(np);
      }
      return out;
    } catch (err) {
      ctx.logger?.('reddit search falhou', err);
      return [];
    }
  },

  normalize(raw, source) {
    return normalizePost(raw as RedditThing, source);
  },

  async healthCheck(source, ctx): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const token = await getToken(source, ctx);
      const base = token ? OAUTH_BASE : PUBLIC_BASE;
      const sub = ((source.config.subreddits as string[]) ?? ['whatsapp'])[0];
      const res = await ctx.fetch(`${base}/r/${sub}/new.json?limit=1`, {
        headers: { 'user-agent': userAgent(source), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      return {
        ok: res.ok,
        message: res.ok ? `OK (${token ? 'OAuth' : 'público'})` : `HTTP ${res.status}`,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    }
  },
};

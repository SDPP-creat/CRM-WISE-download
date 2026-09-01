import type { HealthCheckResult, NormalizedComment, NormalizedPost, SourceRuntimeConfig } from '@wise-news/shared';
import { canonicalizeUrl, contentHash, detectLanguage } from '@wise-news/shared';
import { httpText } from './http.js';
import type { FetchLatestResult, SourceAdapter } from './types.js';

interface RssItem { title: string; link: string; description: string; author?: string; pubDate?: string; guid?: string }

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
}
function pickAttr(block: string, tag: string, attr: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

/** Parser leve de RSS 2.0 e Atom (sem dependências). */
export function parseFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks) {
    items.push({
      title: pick(block, 'title'),
      link: pick(block, 'link'),
      description: pick(block, 'description') || pick(block, 'content:encoded'),
      author: pick(block, 'dc:creator') || pick(block, 'author'),
      pubDate: pick(block, 'pubDate'),
      guid: pick(block, 'guid'),
    });
  }
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of entryBlocks) {
    items.push({
      title: pick(block, 'title'),
      link: pickAttr(block, 'link', 'href') || pick(block, 'id'),
      description: pick(block, 'summary') || pick(block, 'content'),
      author: pick(block, 'name'),
      pubDate: pick(block, 'updated') || pick(block, 'published'),
      guid: pick(block, 'id'),
    });
  }
  return items;
}

function normalizeItem(item: RssItem, source: SourceRuntimeConfig): NormalizedPost | null {
  if (!item.title || !item.link) return null;
  const body = item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const externalId = item.guid || contentHash(item.link);
  const created = item.pubDate ? new Date(item.pubDate) : new Date();
  return {
    externalId,
    sourceSlug: source.slug,
    url: item.link,
    canonicalUrl: canonicalizeUrl(item.link),
    title: item.title,
    body,
    author: item.author || source.slug,
    createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
    lang: detectLanguage(`${item.title}\n${body}`),
    metrics: {},
    mediaUrls: [],
    links: [item.link],
    raw: item,
  };
}

export const rssAdapter: SourceAdapter = {
  kind: 'rss',

  validateConfig(source) {
    const errors: string[] = [];
    if (!source.config.feedUrl) errors.push('config.feedUrl é obrigatório.');
    return { ok: errors.length === 0, errors };
  },

  async fetchLatest(source, ctx): Promise<FetchLatestResult> {
    const feedUrl = source.config.feedUrl as string;
    const posts: NormalizedPost[] = [];
    if (!feedUrl) return { posts, cursors: {} };
    try {
      const xml = await httpText(feedUrl, { fetchImpl: ctx.fetch, headers: { 'user-agent': 'wise-news/0.1' } });
      for (const item of parseFeed(xml)) {
        const np = normalizeItem(item, source);
        if (np) {
          const override = source.config.sourceClassOverride as string | undefined;
          if (override) np.raw = { ...item, sourceClass: override };
          posts.push(np);
        }
      }
    } catch (err) {
      ctx.logger?.(`rss fetchLatest falhou: ${feedUrl}`, err);
    }
    return { posts, cursors: {} };
  },

  async fetchPost() { return null; },
  async fetchComments(): Promise<NormalizedComment[]> { return []; },

  normalize(raw, source) {
    return normalizeItem(raw as RssItem, source);
  },

  async healthCheck(source, ctx): Promise<HealthCheckResult> {
    const start = Date.now();
    const feedUrl = source.config.feedUrl as string;
    if (!feedUrl) return { ok: false, message: 'feedUrl não configurada', checkedAt: new Date().toISOString() };
    try {
      const res = await ctx.fetch(feedUrl, { headers: { 'user-agent': 'wise-news/0.1' } });
      return { ok: res.ok, message: res.ok ? 'OK' : `HTTP ${res.status}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    }
  },
};

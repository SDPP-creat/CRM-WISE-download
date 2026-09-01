import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceRuntimeConfig } from '@wise-news/shared';
import { redditAdapter, parseFeed, httpJson, defaultContext } from '@wise-news/source-adapters';

const dir = dirname(fileURLToPath(import.meta.url));
const listing = JSON.parse(readFileSync(join(dir, 'fixtures/reddit-listing.json'), 'utf8'));
const comments = JSON.parse(readFileSync(join(dir, 'fixtures/reddit-comments.json'), 'utf8'));

const redditSource: SourceRuntimeConfig = {
  slug: 'reddit-core', connector: 'reddit', sourceClass: 'community', enabled: true, intervalMinutes: 30,
  config: { subreddits: ['WhatsappBusinessAPI'], listing: 'new', limitPerSub: 25 },
  secrets: {},
};

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('Reddit adapter', () => {
  it('normaliza um post preservando fonte, métricas e links', () => {
    const raw = listing.data.children[0].data;
    const np = redditAdapter.normalize(raw, redditSource)!;
    expect(np.externalId).toBe('abc123');
    expect(np.author).toBe('anon_user_01');
    expect(np.metrics.score).toBe(42);
    expect(np.url).toContain('/r/WhatsappBusinessAPI/comments/abc123/');
    expect(np.links.some((l) => l.includes('developers.facebook.com'))).toBe(true);
    expect(np.updatedAt).toBeTruthy(); // capturou edição
  });

  it('fetchLatest usa fetch injetado e retorna posts normalizados', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(listing));
    const ctx = defaultContext({ fetch: fetchMock as unknown as typeof fetch });
    const res = await redditAdapter.fetchLatest(redditSource, ctx);
    expect(res.posts.length).toBe(2);
    expect(res.cursors.WhatsappBusinessAPI.lastSeen).toBe('abc123');
  });

  it('fetchComments achata a árvore de comentários', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(comments));
    const ctx = defaultContext({ fetch: fetchMock as unknown as typeof fetch });
    const list = await redditAdapter.fetchComments(redditSource, 'abc123', ctx);
    expect(list.length).toBe(2);
    expect(list[0].author).toBe('helper_dev');
    expect(list[0].body).toContain('#131049');
  });

  it('validateConfig aceita subreddits e falha sem eles', () => {
    expect(redditAdapter.validateConfig(redditSource).ok).toBe(true);
    const bad = { ...redditSource, config: {} };
    expect(redditAdapter.validateConfig(bad).ok).toBe(false);
  });
});

describe('RSS parser', () => {
  it('extrai itens de RSS 2.0', () => {
    const xml = `<rss><channel>
      <item><title>WhatsApp API pricing update</title><link>https://example.com/a</link><description><![CDATA[New rates]]></description><pubDate>Mon, 01 Sep 2025 10:00:00 GMT</pubDate><guid>g1</guid></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('WhatsApp API pricing update');
    expect(items[0].link).toBe('https://example.com/a');
  });
  it('extrai entries de Atom', () => {
    const xml = `<feed><entry><title>Changelog</title><link href="https://example.com/b"/><summary>x</summary><id>id2</id><updated>2025-09-01T10:00:00Z</updated></entry></feed>`;
    const items = parseFeed(xml);
    expect(items[0].link).toBe('https://example.com/b');
  });
});

describe('HTTP retry / backoff', () => {
  it('reintenta em 500 e sucede na terceira tentativa', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls < 3) return new Response('err', { status: 500 });
      return jsonResponse({ ok: true });
    });
    const data = await httpJson<{ ok: boolean }>('https://x.test', { fetchImpl: fetchMock as unknown as typeof fetch, retries: 3 });
    expect(data.ok).toBe(true);
    expect(calls).toBe(3);
  });
});

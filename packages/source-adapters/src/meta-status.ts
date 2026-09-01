import type { HealthCheckResult, NormalizedComment, NormalizedPost, SourceRuntimeConfig } from '@wise-news/shared';
import { canonicalizeUrl, contentHash } from '@wise-news/shared';
import { httpJson, httpText } from './http.js';
import type { FetchLatestResult, SourceAdapter } from './types.js';

/**
 * Conector de status oficial. Suporta:
 *  - Atlassian Statuspage (config.statuspageApi = ".../api/v2/incidents.json")
 *  - Página HTML genérica (config.url) — heurística best-effort.
 * Fonte sempre classificada como "official".
 */

interface StatuspageIncident {
  id: string;
  name: string;
  status: string;
  impact: string;
  shortlink?: string;
  created_at: string;
  updated_at: string;
  incident_updates?: Array<{ body: string; created_at: string }>;
}

function fromIncident(inc: StatuspageIncident, source: SourceRuntimeConfig): NormalizedPost {
  const body = (inc.incident_updates ?? []).map((u) => u.body).join('\n\n');
  return {
    externalId: inc.id,
    sourceSlug: source.slug,
    url: inc.shortlink ?? (source.config.url as string) ?? '',
    canonicalUrl: canonicalizeUrl(inc.shortlink ?? (source.config.url as string) ?? ''),
    title: `[${inc.impact}] ${inc.name}`,
    body: `Status: ${inc.status}\n\n${body}`,
    author: 'Meta / WhatsApp Status',
    createdAt: inc.created_at,
    updatedAt: inc.updated_at,
    lang: 'en',
    metrics: {},
    mediaUrls: [],
    links: [],
    raw: inc,
  };
}

export const metaStatusAdapter: SourceAdapter = {
  kind: 'meta-status',

  validateConfig(source) {
    const errors: string[] = [];
    if (!source.config.url && !source.config.statuspageApi) errors.push('Defina config.url ou config.statuspageApi.');
    return { ok: errors.length === 0, errors };
  },

  async fetchLatest(source, ctx): Promise<FetchLatestResult> {
    const apiUrl = source.config.statuspageApi as string | undefined;
    const posts: NormalizedPost[] = [];
    if (apiUrl) {
      try {
        const data = await httpJson<{ incidents: StatuspageIncident[] }>(apiUrl, { fetchImpl: ctx.fetch });
        for (const inc of data.incidents ?? []) posts.push(fromIncident(inc, source));
      } catch (err) {
        ctx.logger?.('meta-status statuspage falhou', err);
      }
      return { posts, cursors: {} };
    }
    // Modo HTML heurístico: registra uma "captura" apenas se detectar incidente.
    const url = source.config.url as string;
    try {
      const html = await httpText(url, { fetchImpl: ctx.fetch, headers: { 'user-agent': 'wise-news/0.1' } });
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const degraded = /(degraded|outage|partial|disruption|incident|investigating|interrupç|instabil)/i.test(text);
      if (degraded) {
        const snippet = text.slice(0, 800);
        posts.push({
          externalId: contentHash(snippet).slice(0, 12),
          sourceSlug: source.slug,
          url,
          canonicalUrl: canonicalizeUrl(url),
          title: 'Possível incidente detectado na página de status oficial',
          body: snippet,
          author: 'Meta / WhatsApp Status',
          createdAt: new Date().toISOString(),
          lang: 'en',
          metrics: {},
          mediaUrls: [],
          links: [url],
          raw: { snippet },
        });
      }
    } catch (err) {
      ctx.logger?.('meta-status HTML falhou', err);
    }
    return { posts, cursors: {} };
  },

  async fetchPost() { return null; },
  async fetchComments(): Promise<NormalizedComment[]> { return []; },

  normalize(raw, source) {
    return fromIncident(raw as StatuspageIncident, source);
  },

  async healthCheck(source, ctx): Promise<HealthCheckResult> {
    const start = Date.now();
    const url = (source.config.statuspageApi as string) || (source.config.url as string);
    try {
      const res = await ctx.fetch(url, { headers: { 'user-agent': 'wise-news/0.1' } });
      return { ok: res.ok, message: res.ok ? 'OK' : `HTTP ${res.status}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    }
  },
};

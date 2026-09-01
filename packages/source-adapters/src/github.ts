import type { HealthCheckResult, NormalizedComment, NormalizedPost, SourceRuntimeConfig } from '@wise-news/shared';
import { canonicalizeUrl, detectLanguage } from '@wise-news/shared';
import { httpJson } from './http.js';
import type { FetchLatestResult, SourceAdapter } from './types.js';

const API = 'https://api.github.com';

interface GhIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  comments_url: string;
  comments: number;
  reactions?: { total_count?: number };
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  repository_url?: string;
}
interface GhComment {
  id: number;
  body: string;
  html_url: string;
  user: { login: string } | null;
  created_at: string;
  reactions?: { total_count?: number };
}

function ghHeaders(source: SourceRuntimeConfig): Record<string, string> {
  const h: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'wise-news/0.1',
    'x-github-api-version': '2022-11-28',
  };
  if (source.secrets.GITHUB_TOKEN) h.authorization = `Bearer ${source.secrets.GITHUB_TOKEN}`;
  return h;
}

function normalizeIssue(issue: GhIssue, source: SourceRuntimeConfig): NormalizedPost | null {
  if (!issue.id || !issue.title) return null;
  const repo = issue.repository_url?.replace(`${API}/repos/`, '') ?? issue.html_url.split('/').slice(3, 5).join('/');
  const body = issue.body ?? '';
  return {
    externalId: String(issue.id),
    sourceSlug: source.slug,
    url: issue.html_url,
    canonicalUrl: canonicalizeUrl(issue.html_url),
    title: issue.title,
    body,
    author: issue.user?.login ?? 'ghost',
    community: repo,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    lang: detectLanguage(`${issue.title}\n${body}`),
    metrics: { score: issue.reactions?.total_count, comments: issue.comments },
    mediaUrls: [],
    links: Array.from(body.matchAll(/https?:\/\/[^\s)"']+/g)).map((m) => m[0]),
    raw: issue,
  };
}

export const githubAdapter: SourceAdapter = {
  kind: 'github',

  validateConfig(source) {
    const errors: string[] = [];
    const queries = source.config.queries as string[];
    if ((!Array.isArray(queries) || queries.length === 0) && !source.config.repos) {
      errors.push('Defina config.queries e/ou config.repos.');
    }
    return { ok: errors.length === 0, errors };
  },

  async fetchLatest(source, ctx): Promise<FetchLatestResult> {
    const queries = (source.config.queries as string[]) ?? [];
    const posts: NormalizedPost[] = [];
    for (const q of queries) {
      const url = `${API}/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=25`;
      try {
        const data = await httpJson<{ items: GhIssue[] }>(url, { fetchImpl: ctx.fetch, headers: ghHeaders(source) });
        for (const issue of data.items ?? []) {
          const np = normalizeIssue(issue, source);
          if (np) posts.push(np);
        }
      } catch (err) {
        ctx.logger?.(`github search falhou: ${q}`, err);
      }
    }
    return { posts, cursors: {} };
  },

  async fetchPost(source, externalId, ctx) {
    // externalId aqui é o id numérico do issue; usamos busca por id não é direto.
    // Reprocesso normalmente re-usa o raw salvo; retornamos null se não houver contexto.
    void source; void externalId; void ctx;
    return null;
  },

  async fetchComments(source, externalId, ctx) {
    // externalId = "owner/repo#number" opcional; se vier só numérico, sem comments.
    const parts = externalId.split('#');
    if (parts.length !== 2) return [];
    const [repo, number] = parts;
    try {
      const data = await httpJson<GhComment[]>(`${API}/repos/${repo}/issues/${number}/comments?per_page=100`, {
        fetchImpl: ctx.fetch, headers: ghHeaders(source),
      });
      return data.map((c): NormalizedComment => ({
        externalId: String(c.id),
        postExternalId: externalId,
        author: c.user?.login ?? 'ghost',
        body: c.body ?? '',
        score: c.reactions?.total_count,
        createdAt: c.created_at,
        url: c.html_url,
        isReply: false,
      }));
    } catch {
      return [];
    }
  },

  async search(query, source, ctx) {
    // Enviesa a busca para o domínio do WISE NEWS + a pergunta do usuário.
    const q = `${query} whatsapp in:title,body`;
    const url = `${API}/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=15`;
    try {
      const data = await httpJson<{ items: GhIssue[] }>(url, { fetchImpl: ctx.fetch, headers: ghHeaders(source) });
      const out: NormalizedPost[] = [];
      for (const issue of data.items ?? []) {
        const np = normalizeIssue(issue, source);
        if (np) out.push(np);
      }
      return out;
    } catch (err) {
      ctx.logger?.('github search falhou', err);
      return [];
    }
  },

  normalize(raw, source) {
    return normalizeIssue(raw as GhIssue, source);
  },

  async healthCheck(source, ctx): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const res = await ctx.fetch(`${API}/rate_limit`, { headers: ghHeaders(source) });
      return { ok: res.ok, message: res.ok ? `OK${source.secrets.GITHUB_TOKEN ? ' (token)' : ' (anon)'}` : `HTTP ${res.status}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, message: (err as Error).message, checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
    }
  },
};

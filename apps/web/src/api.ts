import type { FeedPost } from '@wise-news/shared';

const BASE = import.meta.env.VITE_API_URL || '';

let token: string | null = null;
try { token = localStorage.getItem('wn_token'); } catch { /* ignore */ }

export function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem('wn_token', t);
    else localStorage.removeItem('wn_token');
  } catch { /* ignore */ }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((msg as { error?: string }).error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface FeedResponse { posts: FeedPost[]; count: number }
export interface PostDetail {
  post: Record<string, unknown> & { id: number; title: string; body: string; url: string; flag: string; country_name: string; created_at: string; lang: string | null };
  translation: { title_pt?: string } | null;
  summary: { short_summary?: string; problem?: string; attempts?: string[]; result?: string; evidence?: string[]; open_questions?: string[] } | null;
  wise_analysis: Record<string, unknown> | null;
  participants: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  related: Array<{ id: number; title: string; source_name: string; url: string }>;
}

export interface FeedQuery {
  country?: string; category?: string; sourceClass?: string; impact?: string; confidence?: string; q?: string; limit?: number; offset?: number;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  feed: (query: FeedQuery = {}) => req<FeedResponse>(`/api/feed${qs(query as Record<string, unknown>)}`),
  search: (q: string) => req<FeedResponse>(`/api/search${qs({ q })}`),
  post: (id: number | string) => req<PostDetail>(`/api/posts/${id}`),
  categories: () => req<{ categories: Array<{ slug: string; label: string; description: string; count: number }> }>('/api/categories'),
  countries: () => req<{ countries: Array<{ code: string; name: string; flag: string; count: number }> }>('/api/countries'),
  sources: () => req<{ sources: Array<{ slug: string; name: string; connector: string; source_class: string; enabled: number }> }>('/api/sources'),

  // Auth
  login: (phone: string, password: string) => req<{ token: string; user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => req<{ user: AuthUser | null }>('/api/auth/me'),

  // Perguntas (Q&A agregado)
  questions: () => req<{ questions: QuestionListItem[] }>('/api/questions'),
  createQuestion: (text: string) => req<{ id: number }>('/api/questions', { method: 'POST', body: JSON.stringify({ text }) }),
  question: (id: number | string) => req<QuestionDetail>(`/api/questions/${id}`),
  refreshQuestion: (id: number | string) => req<{ ok: boolean }>(`/api/questions/${id}/refresh`, { method: 'POST' }),

  // User
  bookmarks: () => req<FeedResponse>('/api/me/bookmarks'),
  addBookmark: (id: number) => req<{ ok: boolean }>(`/api/me/bookmarks/${id}`, { method: 'POST' }),
  removeBookmark: (id: number) => req<{ ok: boolean }>(`/api/me/bookmarks/${id}`, { method: 'DELETE' }),
  notifications: () => req<{ notifications: Array<Record<string, unknown>> }>('/api/me/notifications'),

  // Admin
  admin: {
    overview: () => req<Record<string, number | boolean>>('/api/admin/overview'),
    sources: () => req<{ sources: Array<Record<string, unknown>> }>('/api/admin/sources'),
    patchSource: (id: number, body: Record<string, unknown>) => req(`/api/admin/sources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    testSource: (slug: string) => req<{ validation: { ok: boolean; errors: string[] }; health: { ok: boolean; message: string } }>(`/api/admin/sources/${slug}/test`, { method: 'POST' }),
    collect: (slug?: string) => req<{ ok: boolean; started?: boolean; message?: string }>(`/api/admin/collect${slug ? `?slug=${slug}` : ''}`, { method: 'POST' }),
    reprocessPending: () => req<{ ok: boolean; queued: number }>('/api/admin/reprocess-pending', { method: 'POST' }),
    health: () => req<{ collectors: Array<Record<string, unknown>> }>('/api/admin/health'),
    review: () => req<{ posts: Array<Record<string, unknown>> }>('/api/admin/review'),
    reprocess: (id: number) => req(`/api/admin/posts/${id}/reprocess`, { method: 'POST' }),
    approve: (id: number) => req(`/api/admin/posts/${id}/approve`, { method: 'POST' }),
    reject: (id: number) => req(`/api/admin/posts/${id}/reject`, { method: 'POST' }),
    keywords: () => req<{ keywords: Array<Record<string, unknown>> }>('/api/admin/keywords'),
    addKeyword: (body: Record<string, unknown>) => req('/api/admin/keywords', { method: 'POST', body: JSON.stringify(body) }),
    delKeyword: (id: number) => req(`/api/admin/keywords/${id}`, { method: 'DELETE' }),
    users: () => req<{ users: Array<Record<string, unknown>> }>('/api/admin/users'),
    addUser: (body: Record<string, unknown>) => req('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    audit: () => req<{ logs: Array<Record<string, unknown>> }>('/api/admin/audit'),
    aiUsage: () => req<{ daily: Array<Record<string, unknown>>; total: Record<string, unknown> }>('/api/admin/ai-usage'),
    aiTest: () => req<{ ok: boolean; message: string }>('/api/admin/ai/test', { method: 'POST' }),
  },
};

export interface AuthUser { id: number; name: string; phone: string; role: 'admin' | 'editor' | 'reader' }

export interface QuestionListItem {
  id: number; text: string; status: string; ai_status: string; answers_count: number; created_at: string; updated_at: string;
}
export interface QaAnswer {
  id: number; forum: string; source_slug?: string; source_class?: string; post_id?: number | null;
  author?: string | null; title?: string | null; excerpt: string; url: string; score?: number | null; relevance?: number | null; lang?: string | null; created_at?: string | null;
}
export interface QuestionDetail {
  question: {
    id: number; text: string; status: string; ai_status: string; answers_count: number; created_at: string; last_checked_at: string | null;
    ai_answer: string | null; ai_confidence: 'high' | 'medium' | 'low' | null;
    ai_per_source: Array<{ forum: string; stance: string; note: string }>;
    ai_contradictions: string[]; ai_caveats: string[]; ai_error: string | null;
  };
  answers: QaAnswer[];
  byForum: Record<string, QaAnswer[]>;
  forums: string[];
}

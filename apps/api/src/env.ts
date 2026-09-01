import type { D1Database, KVNamespace, R2Bucket, Queue } from '@cloudflare/workers-types';

/** Bindings e variáveis do Worker (segredos entram via `wrangler secret put`). */
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  QUEUE: Queue<PipelineJob>;

  // Vars / secrets
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  AI_MAX_TOKENS?: string;
  AI_MONTHLY_BUDGET_USD?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USER_AGENT?: string;
  GITHUB_TOKEN?: string;
  STACKEXCHANGE_KEY?: string;
  AUTH_SESSION_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  PUBLIC_WEB_URL?: string;
}

export type PipelineJobType = 'process_post' | 'fetch_comments';

export interface PipelineJob {
  type: PipelineJobType;
  postId: number;
  attempt?: number;
}

/** Extrai os segredos relevantes para os adaptadores de fonte. */
export function adapterSecrets(env: Env): Record<string, string | undefined> {
  return {
    REDDIT_CLIENT_ID: env.REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET: env.REDDIT_CLIENT_SECRET,
    REDDIT_USER_AGENT: env.REDDIT_USER_AGENT,
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    STACKEXCHANGE_KEY: env.STACKEXCHANGE_KEY,
  };
}

import type { ConnectorKind } from '@wise-news/shared';
import { redditAdapter } from './reddit.js';
import { stackexchangeAdapter } from './stackexchange.js';
import { githubAdapter } from './github.js';
import { hackernewsAdapter } from './hackernews.js';
import { rssAdapter } from './rss.js';
import { metaStatusAdapter } from './meta-status.js';
import type { SourceAdapter } from './types.js';

export * from './types.js';
export * from './http.js';
export { redditAdapter } from './reddit.js';
export { stackexchangeAdapter } from './stackexchange.js';
export { githubAdapter } from './github.js';
export { hackernewsAdapter } from './hackernews.js';
export { rssAdapter, parseFeed } from './rss.js';
export { metaStatusAdapter } from './meta-status.js';

export const ADAPTERS: Record<ConnectorKind, SourceAdapter> = {
  reddit: redditAdapter,
  stackexchange: stackexchangeAdapter,
  github: githubAdapter,
  hackernews: hackernewsAdapter,
  rss: rssAdapter,
  'meta-status': metaStatusAdapter,
};

export function getAdapter(kind: string): SourceAdapter | null {
  return (ADAPTERS as Record<string, SourceAdapter>)[kind] ?? null;
}

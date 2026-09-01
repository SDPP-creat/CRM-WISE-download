import type { Env } from '../env.js';
import { getAdapter, defaultContext } from '@wise-news/source-adapters';
import { adapterSecrets } from '../env.js';
import { insertPost, loadSources, audit } from '../db.js';
import { enqueue } from './enqueue.js';

/** Executa a coleta das fontes que estão "vencidas" (respeita interval por fonte). */
export async function runCollection(env: Env, opts: { force?: boolean; slug?: string } = {}): Promise<{ collected: number; newPosts: number }> {
  const secrets = adapterSecrets(env);
  const sources = await loadSources(env.DB, secrets, true);
  const now = Date.now();
  let collected = 0;
  let newPosts = 0;

  for (const source of sources) {
    if (opts.slug && source.slug !== opts.slug) continue;
    const lastKey = `lastrun:${source.slug}`;
    if (!opts.force) {
      const last = await env.KV.get(lastKey);
      if (last && now - Number(last) < source.intervalMinutes * 60_000) continue;
    }
    const adapter = getAdapter(source.connector);
    if (!adapter) continue;

    const sourceRow = await env.DB.prepare('SELECT id FROM sources WHERE slug = ?').bind(source.slug).first<{ id: number }>();
    if (!sourceRow) continue;
    const sourceId = sourceRow.id;

    const runRes = await env.DB.prepare('INSERT INTO crawl_runs (source_id, status) VALUES (?, ?)').bind(sourceId, 'running').run();
    const runId = runRes.meta.last_row_id as number;
    const started = Date.now();

    try {
      // Carrega cursores persistidos.
      const cursorRows = await env.DB.prepare('SELECT scope, cursor, last_seen FROM source_cursors WHERE source_id = ?').bind(sourceId).all<{ scope: string; cursor: string | null; last_seen: string | null }>();
      const cursors: Record<string, { cursor?: string; lastSeen?: string }> = {};
      for (const row of cursorRows.results ?? []) cursors[row.scope] = { cursor: row.cursor ?? undefined, lastSeen: row.last_seen ?? undefined };

      const ctx = defaultContext({ fetch: fetch.bind(globalThis), cursors, logger: (m, e) => console.warn(`[${source.slug}] ${m}`, e ?? '') });
      const result = await adapter.fetchLatest(source, ctx);
      collected++;

      let found = 0;
      let created = 0;
      for (const np of result.posts) {
        found++;
        const ins = await insertPost(env.DB, sourceId, np);
        if (ins.isNew) {
          created++;
          newPosts++;
          // Enfileira processamento (comentários + IA). Sem Queues, roda inline.
          await enqueue(env, { type: 'fetch_comments', postId: ins.postId });
        }
      }

      // Persiste cursores.
      for (const [scope, cur] of Object.entries(result.cursors)) {
        await env.DB
          .prepare('INSERT INTO source_cursors (source_id, scope, cursor, last_seen, updated_at) VALUES (?,?,?,?,datetime(\'now\')) ON CONFLICT(source_id, scope) DO UPDATE SET cursor=excluded.cursor, last_seen=excluded.last_seen, updated_at=datetime(\'now\')')
          .bind(sourceId, scope, cur.cursor ?? null, cur.lastSeen ?? null)
          .run();
      }

      await env.DB
        .prepare('UPDATE crawl_runs SET status=?, finished_at=datetime(\'now\'), items_found=?, items_new=?, latency_ms=? WHERE id=?')
        .bind('ok', found, created, Date.now() - started, runId)
        .run();
      await env.KV.put(lastKey, String(now));
    } catch (err) {
      await env.DB
        .prepare('UPDATE crawl_runs SET status=?, finished_at=datetime(\'now\'), error=?, latency_ms=? WHERE id=?')
        .bind('error', (err as Error).message, Date.now() - started, runId)
        .run();
      await audit(env.DB, 'system', 'crawl_error', 'source', source.slug, { error: (err as Error).message });
    }
  }

  return { collected, newPosts };
}

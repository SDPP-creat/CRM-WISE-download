import { useEffect, useMemo, useState } from 'react';
import type { FeedPost } from '@wise-news/shared';
import { api } from '../api.js';
import { AppHeader } from '../components/AppHeader.js';
import { NewsCard } from '../components/NewsCard.js';
import { Section, Spinner, EmptyState } from '../components/ui.js';

const FILTERS = [
  { key: '', label: 'Tudo' },
  { key: 'official', label: 'Oficiais', field: 'sourceClass' },
  { key: 'community', label: 'Comunidade', field: 'sourceClass' },
  { key: 'critical', label: 'Crítico', field: 'impact' },
];

export function Home() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const active = FILTERS.find((f) => f.key === filter);
    const query = active?.field ? { [active.field]: active.key } : {};
    setPosts(null);
    api.feed({ ...query, limit: 60 }).then((r) => setPosts(r.posts)).catch((e) => setError(e.message));
  }, [filter]);

  // Atualização ao vivo via SSE (novos posts entram no topo).
  useEffect(() => {
    const since = posts && posts.length ? posts[0].id : 0;
    const es = new EventSource(`${import.meta.env.VITE_API_URL || ''}/api/stream?since=${since}`);
    es.addEventListener('posts', (ev) => {
      try {
        const incoming = JSON.parse((ev as MessageEvent).data) as FeedPost[];
        setPosts((prev) => {
          const seen = new Set((prev ?? []).map((p) => p.id));
          const fresh = incoming.filter((p) => !seen.has(p.id));
          return fresh.length ? [...fresh, ...(prev ?? [])] : prev;
        });
      } catch { /* ignore */ }
    });
    return () => es.close();
  }, [filter]);

  const urgent = useMemo(() => (posts ?? []).filter((p) => p.impact === 'critical' || p.impact === 'high').slice(0, 5), [posts]);
  const official = useMemo(() => (posts ?? []).filter((p) => p.sourceClass === 'official').slice(0, 8), [posts]);
  const community = useMemo(() => (posts ?? []).filter((p) => p.sourceClass !== 'official'), [posts]);

  return (
    <div>
      <AppHeader />
      <div className="px-4">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`chip whitespace-nowrap tap px-3 ${filter === f.key ? 'bg-yellow text-black' : 'bg-panel2 text-gray'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <EmptyState icon="⚠️" title="Erro ao carregar" hint={error} />}
        {!error && posts === null && <Spinner label="Carregando notícias…" />}
        {!error && posts && posts.length === 0 && (
          <EmptyState title="Sem notícias ainda" hint="Assim que os coletores rodarem, as notícias aparecem aqui. No painel admin você pode disparar uma coleta imediata." />
        )}

        {posts && posts.length > 0 && (
          <>
            {urgent.length > 0 && (
              <Section title="Urgentes">
                {urgent.map((p) => <NewsCard key={p.id} post={p} />)}
              </Section>
            )}
            {official.length > 0 && (
              <Section title="Atualizações oficiais">
                {official.map((p) => <NewsCard key={p.id} post={p} />)}
              </Section>
            )}
            <Section title="Relatos da comunidade">
              {community.map((p) => <NewsCard key={p.id} post={p} />)}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

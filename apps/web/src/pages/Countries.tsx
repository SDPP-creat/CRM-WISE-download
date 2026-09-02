import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FeedPost } from '@wise-news/shared';
import { api } from '../api.js';
import { NewsCard } from '../components/NewsCard.js';
import { Flag } from '../components/Flag.js';
import { Spinner, EmptyState } from '../components/ui.js';

export function Countries() {
  const [params, setParams] = useSearchParams();
  const code = params.get('code') ?? '';
  const [list, setList] = useState<Array<{ code: string; name: string; flag: string; count: number }>>([]);
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => { api.countries().then((r) => setList(r.countries)).catch(() => {}); }, []);
  useEffect(() => {
    if (!code) { setPosts(null); return; }
    setPosts(null);
    api.feed({ country: code, limit: 60 }).then((r) => setPosts(r.posts)).catch(() => setPosts([]));
  }, [code]);

  return (
    <div className="px-4 pt-5">
      <h1 className="mb-4 text-xl font-bold">Países</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {list.map((c) => (
          <button key={c.code} onClick={() => setParams({ code: c.code })} className={`chip tap px-3 ${code === c.code ? 'bg-yellow text-black' : 'bg-panel2 text-gray'}`}>
            <Flag code={c.code} name={c.name} size={16} /> {c.name} <span className={code === c.code ? 'text-black/60' : 'text-gray-muted'}>{c.count}</span>
          </button>
        ))}
      </div>
      {!code && <EmptyState icon="🌐" title="Escolha um país" hint="Toque em uma bandeira para ver as notícias relacionadas." />}
      {code && posts === null && <Spinner />}
      {code && posts && posts.length === 0 && <EmptyState title="Sem notícias para este país" />}
      {code && posts && posts.map((p) => <NewsCard key={p.id} post={p} />)}
    </div>
  );
}

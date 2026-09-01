import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FeedPost } from '@wise-news/shared';
import { CATEGORIES } from '@wise-news/shared';
import { api } from '../api.js';
import { NewsCard } from '../components/NewsCard.js';
import { Spinner, EmptyState } from '../components/ui.js';

export function Search() {
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = (q: string, cat: string) => {
    setLoading(true);
    const p = cat ? api.feed({ q: q || undefined, category: cat, limit: 60 }) : (q ? api.search(q) : api.feed({ limit: 40 }));
    p.then((r) => setPosts(r.posts)).catch(() => setPosts([])).finally(() => setLoading(false));
  };

  useEffect(() => { run(term, category); }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(category ? { q: term, category } : { q: term });
    run(term, category);
  };

  return (
    <div className="px-4 pt-4">
      <form onSubmit={submit} className="mb-3">
        <input autoFocus className="input" placeholder="Buscar por erro, país, tópico…" value={term} onChange={(e) => setTerm(e.target.value)} />
      </form>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => { setCategory(''); run(term, ''); }} className={`chip tap px-3 whitespace-nowrap ${!category ? 'bg-yellow text-black' : 'bg-panel2 text-gray'}`}>Todas</button>
        {CATEGORIES.map((c) => (
          <button key={c.slug} onClick={() => { setCategory(c.slug); run(term, c.slug); }} className={`chip tap px-3 whitespace-nowrap ${category === c.slug ? 'bg-yellow text-black' : 'bg-panel2 text-gray'}`}>{c.label}</button>
        ))}
      </div>
      {loading && <Spinner />}
      {!loading && posts && posts.length === 0 && <EmptyState title="Nada encontrado" hint="Tente outro termo ou categoria." />}
      {!loading && posts && posts.map((p) => <NewsCard key={p.id} post={p} />)}
    </div>
  );
}

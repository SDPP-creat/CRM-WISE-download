import { useEffect, useState } from 'react';
import type { FeedPost } from '@wise-news/shared';
import { api } from '../api.js';
import { useBookmarks } from '../useBookmarks.js';
import { NewsCard } from '../components/NewsCard.js';
import { EmptyState, Spinner } from '../components/ui.js';

export function Saved() {
  const { ids } = useBookmarks();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    if (ids.size === 0) { setPosts([]); return; }
    api.feed({ limit: 100 }).then((r) => setPosts(r.posts.filter((p) => ids.has(p.id)))).catch(() => setPosts([]));
  }, [ids]);

  return (
    <div className="px-4 pt-5">
      <h1 className="mb-4 text-xl font-bold">Salvos</h1>
      {posts === null && <Spinner />}
      {posts && posts.length === 0 && <EmptyState icon="★" title="Nada salvo ainda" hint="Toque em ☆ Salvar num card para guardar aqui." />}
      {posts && posts.map((p) => <NewsCard key={p.id} post={p} />)}
    </div>
  );
}

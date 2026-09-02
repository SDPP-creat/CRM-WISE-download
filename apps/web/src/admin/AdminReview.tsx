import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, EmptyState } from '../components/ui.js';

interface RP { id: number; title: string; processing_status: string; ai_error?: string; source_name: string; created_at: string }

export function AdminReview() {
  const [posts, setPosts] = useState<RP[] | null>(null);
  const load = () => api.admin.review().then((r) => setPosts(r.posts as unknown as RP[])).catch(() => setPosts([]));
  useEffect(() => { load(); }, []);

  const act = async (id: number, fn: (id: number) => Promise<unknown>) => { await fn(id); load(); };

  if (!posts) return <Spinner />;
  if (posts.length === 0) return <EmptyState icon="✅" title="Fila de revisão vazia" hint="Nada pendente, com falha ou aguardando revisão." />;

  return (
    <div>
      {posts.map((p) => (
        <div key={p.id} className="card mb-2 p-3">
          <Link to={`/post/${p.id}`} className="text-sm font-medium">{p.title}</Link>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-muted">
            <span className={`chip ${p.processing_status === 'failed' ? 'bg-alert/15 text-alert' : 'bg-panel2 text-gray'}`}>{p.processing_status}</span>
            <span>{p.source_name}</span>
          </div>
          {p.ai_error && <div className="mt-1 text-xs text-alert">{p.ai_error}</div>}
          <div className="mt-2 flex gap-2">
            <button onClick={() => act(p.id, api.admin.reprocess)} className="btn-ghost px-3 py-1.5 text-xs">Reprocessar</button>
            <button onClick={() => act(p.id, api.admin.approve)} className="btn-ghost px-3 py-1.5 text-xs text-confirmed">Aprovar</button>
            <button onClick={() => act(p.id, api.admin.reject)} className="btn-ghost px-3 py-1.5 text-xs text-alert">Rejeitar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

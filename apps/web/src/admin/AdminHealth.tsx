import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner, timeAgo } from '../components/ui.js';

interface Col { slug: string; name: string; connector: string; enabled: number; status?: string; started_at?: string; items_found?: number; items_new?: number; error?: string; latency_ms?: number }

export function AdminHealth() {
  const [cols, setCols] = useState<Col[] | null>(null);
  useEffect(() => { api.admin.health().then((r) => setCols(r.collectors as unknown as Col[])).catch(() => setCols([])); }, []);
  if (!cols) return <Spinner />;

  return (
    <div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray">Saúde dos coletores</h2>
      {cols.map((c) => (
        <div key={c.slug} className="card mb-2 flex items-center justify-between p-3">
          <div>
            <div className="text-sm font-medium">{c.name}</div>
            <div className="text-xs text-gray-muted">
              {c.started_at ? `última: ${timeAgo(c.started_at)}` : 'nunca rodou'}
              {c.items_new !== undefined ? ` · ${c.items_new} novos / ${c.items_found} achados` : ''}
              {c.latency_ms ? ` · ${c.latency_ms}ms` : ''}
            </div>
            {c.error && <div className="text-xs text-alert">{c.error}</div>}
          </div>
          <span className={`chip ${!c.enabled ? 'bg-gray/10 text-gray-muted' : c.status === 'ok' ? 'bg-confirmed/15 text-confirmed' : c.status === 'error' ? 'bg-alert/15 text-alert' : 'bg-panel2 text-gray'}`}>
            {!c.enabled ? 'pausada' : c.status ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

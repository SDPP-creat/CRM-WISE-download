import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner } from '../components/ui.js';

const CLASS_LABEL: Record<string, string> = {
  official: 'Oficial', partner: 'Parceiro/BSP', community: 'Comunidade', forum: 'Fórum', individual: 'Relato', promo: 'Promocional',
};

export function SourcesPage() {
  const [sources, setSources] = useState<Array<{ slug: string; name: string; connector: string; source_class: string; enabled: number }> | null>(null);

  useEffect(() => { api.sources().then((r) => setSources(r.sources)).catch(() => setSources([])); }, []);

  return (
    <div className="px-4 pt-5">
      <h1 className="mb-1 text-xl font-bold">Fontes</h1>
      <p className="mb-4 text-sm text-gray">De onde a WISE NEWS coleta. Fontes oficiais têm prioridade sobre comentários.</p>
      {!sources && <Spinner />}
      {sources && sources.map((s) => (
        <div key={s.slug} className="card mb-2 flex items-center justify-between p-4">
          <div>
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-gray-muted">{s.connector} · {CLASS_LABEL[s.source_class] ?? s.source_class}</div>
          </div>
          <span className={`chip ${s.enabled ? 'bg-confirmed/15 text-confirmed' : 'bg-gray/10 text-gray-muted'}`}>{s.enabled ? 'Ativa' : 'Pausada'}</span>
        </div>
      ))}
    </div>
  );
}

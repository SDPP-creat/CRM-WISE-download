import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner } from '../components/ui.js';
import { IconPlay } from '../components/icons.js';

export function AdminDashboard() {
  const [o, setO] = useState<Record<string, number | boolean> | null>(null);
  const [ai, setAi] = useState<{ ok: boolean; message: string } | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api.admin.overview().then(setO).catch(() => {});
  useEffect(() => { load(); }, []);

  const collect = async () => {
    setCollecting(true); setMsg('');
    try {
      await api.admin.collect();
      setMsg('Coleta iniciada em segundo plano. As notícias aparecem em instantes — atualizando…');
      setTimeout(load, 8000);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setCollecting(false);
    }
  };

  if (!o) return <Spinner />;

  const cards = [
    { label: 'Notícias', value: o.posts },
    { label: 'Pendentes', value: o.pending },
    { label: 'Falhas', value: o.failed },
    { label: 'Em revisão', value: o.review },
    { label: 'Fontes ativas', value: o.activeSources },
    { label: 'Custo IA (30d)', value: `$${Number(o.aiCost30d || 0).toFixed(2)}` },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="card p-3">
            <div className="text-lg font-bold text-yellow">{String(c.value)}</div>
            <div className="text-xs text-gray">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card mb-3 p-4">
        <div className="mb-2 text-sm font-semibold">IA</div>
        <div className="mb-2 text-xs text-gray">
          {o.aiConfigured ? 'Chave configurada.' : '⚠ ANTHROPIC_API_KEY não configurada — coleta segue, processamento fica pendente.'}
        </div>
        <div className="flex gap-2">
          <button onClick={() => api.admin.aiTest().then(setAi)} className="btn-ghost px-3 py-1.5 text-xs">Testar IA</button>
          {ai && <span className={`chip ${ai.ok ? 'bg-confirmed/15 text-confirmed' : 'bg-alert/15 text-alert'}`}>{ai.message}</span>}
        </div>
      </div>

      <button onClick={collect} disabled={collecting} className="btn-primary w-full py-3">
        <IconPlay width={16} height={16} /> {collecting ? 'Coletando…' : 'Coletar agora (todas as fontes)'}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-gray">{msg}</p>}
    </div>
  );
}

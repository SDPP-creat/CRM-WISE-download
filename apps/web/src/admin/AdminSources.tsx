import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner } from '../components/ui.js';

interface Src { id: number; slug: string; name: string; connector: string; source_class: string; enabled: number; interval_minutes: number; last_status?: string; last_run?: string; last_error?: string; config?: string }

export function AdminSources() {
  const [sources, setSources] = useState<Src[] | null>(null);
  const [test, setTest] = useState<Record<string, { validation: { ok: boolean; errors: string[] }; health: { ok: boolean; message: string } }>>({});
  const [busy, setBusy] = useState<string>('');

  const load = () => api.admin.sources().then((r) => setSources(r.sources as unknown as Src[])).catch(() => setSources([]));
  useEffect(() => { load(); }, []);

  const toggle = async (s: Src) => { await api.admin.patchSource(s.id, { enabled: !s.enabled }); load(); };
  const setInterval = async (s: Src, v: number) => { await api.admin.patchSource(s.id, { intervalMinutes: v }); load(); };
  const runTest = async (s: Src) => { setBusy(s.slug); const r = await api.admin.testSource(s.slug); setTest((t) => ({ ...t, [s.slug]: r })); setBusy(''); };
  const collectOne = async (s: Src) => { setBusy(s.slug); await api.admin.collect(s.slug).catch(() => {}); setBusy(''); load(); };

  if (!sources) return <Spinner />;

  return (
    <div>
      {sources.map((s) => (
        <div key={s.id} className="card mb-3 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-xs text-gray-muted">{s.connector} · {s.source_class} · {s.slug}</div>
            </div>
            <button onClick={() => toggle(s)} className={`chip tap px-3 ${s.enabled ? 'bg-confirmed/15 text-confirmed' : 'bg-gray/10 text-gray-muted'}`}>{s.enabled ? 'Ativa' : 'Pausada'}</button>
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-gray">
            <span>Frequência:</span>
            <select value={s.interval_minutes} onChange={(e) => setInterval(s, Number(e.target.value))} className="rounded bg-panel2 px-2 py-1">
              {[15, 30, 60, 180, 720, 1440].map((m) => <option key={m} value={m}>{m}min</option>)}
            </select>
            {s.last_status && <span className={`ml-auto chip ${s.last_status === 'ok' ? 'bg-confirmed/15 text-confirmed' : 'bg-alert/15 text-alert'}`}>{s.last_status}</span>}
          </div>
          {s.last_error && <div className="mt-1 text-xs text-alert">Erro: {s.last_error}</div>}

          <div className="mt-3 flex gap-2">
            <button onClick={() => runTest(s)} disabled={busy === s.slug} className="btn-ghost px-3 py-1.5 text-xs">Testar conector</button>
            <button onClick={() => collectOne(s)} disabled={busy === s.slug} className="btn-ghost px-3 py-1.5 text-xs">Coletar agora</button>
          </div>
          {test[s.slug] && (
            <div className="mt-2 text-xs">
              <div className={test[s.slug].validation.ok ? 'text-confirmed' : 'text-alert'}>Config: {test[s.slug].validation.ok ? 'ok' : test[s.slug].validation.errors.join(', ')}</div>
              <div className={test[s.slug].health.ok ? 'text-confirmed' : 'text-alert'}>Saúde: {test[s.slug].health.message}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

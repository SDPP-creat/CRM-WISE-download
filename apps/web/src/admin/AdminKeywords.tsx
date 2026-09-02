import { useEffect, useState } from 'react';
import { CATEGORIES } from '@wise-news/shared';
import { api } from '../api.js';
import { Spinner } from '../components/ui.js';

interface KW { id: number; term: string; lang: string; weight: number; topic?: string; negative: number }

export function AdminKeywords() {
  const [kws, setKws] = useState<KW[] | null>(null);
  const [form, setForm] = useState({ term: '', lang: 'en', weight: 3, topic: '', negative: false });
  const load = () => api.admin.keywords().then((r) => setKws(r.keywords as unknown as KW[])).catch(() => setKws([]));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.term.trim()) return;
    await api.admin.addKeyword({ ...form, topic: form.topic || undefined });
    setForm({ term: '', lang: 'en', weight: 3, topic: '', negative: false });
    load();
  };

  if (!kws) return <Spinner />;

  return (
    <div>
      <div className="card mb-4 space-y-2 p-3">
        <input className="input" placeholder="Termo" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
        <div className="flex gap-2">
          <select className="input" value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })}>
            {['en', 'pt', 'es', 'fr', 'de', 'it', 'hi', 'id', 'tr', 'ar', 'ja'].map((l) => <option key={l}>{l}</option>)}
          </select>
          <select className="input" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>peso {w}</option>)}
          </select>
        </div>
        <select className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
          <option value="">(sem tópico)</option>
          {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray"><input type="checkbox" checked={form.negative} onChange={(e) => setForm({ ...form, negative: e.target.checked })} /> Palavra negativa</label>
        <button onClick={add} className="btn-primary w-full py-2">Adicionar</button>
      </div>

      <div className="card divide-y divide-border">
        {kws.map((k) => (
          <div key={k.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className={k.negative ? 'text-alert' : ''}>{k.term}</span>
            <span className="chip bg-panel2 text-gray-muted">{k.lang}</span>
            <span className="text-xs text-gray-muted">peso {k.weight}{k.topic ? ` · ${k.topic}` : ''}</span>
            <button onClick={() => api.admin.delKeyword(k.id).then(load)} className="tap ml-auto text-xs text-alert">remover</button>
          </div>
        ))}
      </div>
    </div>
  );
}

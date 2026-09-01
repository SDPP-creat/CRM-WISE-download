import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type QaAnswer, type QuestionDetail as QDetail } from '../api.js';
import { ConfidenceBadge, Spinner, EmptyState, timeAgo } from '../components/ui.js';
import { IconArrowLeft, IconRefresh } from '../components/icons.js';

const CLASS_LABEL: Record<string, string> = {
  official: 'Oficial', partner: 'BSP/Parceiro', community: 'Comunidade', forum: 'Fórum', individual: 'Relato', promo: 'Promo',
};

type Ai = QDetail['question'];

export function QuestionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<QDetail | null>(null);
  const [answers, setAnswers] = useState<QaAnswer[]>([]);
  const [ai, setAi] = useState<Partial<Ai>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!id) return;
    api.question(id).then((d) => {
      setData(d);
      setAnswers(d.answers);
      d.answers.forEach((a) => seen.current.add(a.id));
      setAi(d.question);
    }).catch((e) => setError(e.message));
  }, [id]);

  // Ao vivo: novas respostas + resultado da IA.
  useEffect(() => {
    if (!id) return;
    const maxId = Math.max(0, ...answers.map((a) => a.id));
    const es = new EventSource(`${import.meta.env.VITE_API_URL || ''}/api/questions/${id}/stream?since=${maxId}`);
    es.addEventListener('answers', (ev) => {
      try {
        const incoming = JSON.parse((ev as MessageEvent).data) as QaAnswer[];
        setAnswers((prev) => {
          const add = incoming.filter((a) => !seen.current.has(a.id));
          add.forEach((a) => seen.current.add(a.id));
          return add.length ? [...prev, ...add] : prev;
        });
      } catch { /* ignore */ }
    });
    es.addEventListener('ai', (ev) => {
      try { setAi((prev) => ({ ...prev, ...JSON.parse((ev as MessageEvent).data) })); } catch { /* ignore */ }
    });
    return () => es.close();
    // reconecta quando muda a pergunta
  }, [id]);

  const refresh = async () => {
    if (!id) return;
    setRefreshing(true);
    await api.refreshQuestion(id).catch(() => {});
    setTimeout(() => setRefreshing(false), 1500);
  };

  if (error) return <div className="p-4"><EmptyState icon="⚠️" title="Não foi possível abrir" hint={error} /></div>;
  if (!data) return <Spinner label="Buscando respostas…" />;

  // Agrupa respostas por fórum (inclui as que chegaram ao vivo).
  const byForum: Record<string, QaAnswer[]> = {};
  for (const a of [...answers].sort((x, y) => (y.relevance ?? 0) - (x.relevance ?? 0))) {
    (byForum[a.forum] ??= []).push(a);
  }
  const forums = Object.keys(byForum);
  const aiStatus = ai.ai_status ?? data.question.ai_status;

  return (
    <div className="pb-24">
      <header className="safe-top sticky top-0 z-20 flex items-center gap-2 bg-bg/95 px-3 py-3 backdrop-blur">
        <button onClick={() => nav(-1)} className="tap rounded-lg px-2 text-gray"><IconArrowLeft width={20} height={20} /></button>
        <span className="text-sm text-gray">Pergunta</span>
        <button onClick={refresh} className="tap ml-auto flex items-center gap-1.5 rounded-lg px-3 text-sm text-yellow"><IconRefresh width={15} height={15} /> {refreshing ? 'buscando…' : 'Atualizar'}</button>
      </header>

      <div className="px-4">
        <h1 className="mb-3 text-lg font-bold leading-snug">{data.question.text}</h1>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-muted">
          <span className="chip bg-panel2 text-gray">{answers.length} respostas</span>
          <span className="chip bg-panel2 text-gray">{forums.length} fóruns</span>
          {data.question.last_checked_at && <span>verificado {timeAgo(data.question.last_checked_at)}</span>}
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 animate-pulse rounded-full bg-confirmed" /> ao vivo</span>
        </div>

        {/* Resposta combinada (IA) */}
        <section className="card mb-5 border-yellow/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-bold text-yellow">Resposta combinada</h2>
            <ConfidenceBadge confidence={ai.ai_confidence ?? data.question.ai_confidence} />
          </div>
          {aiStatus === 'processing' && <div className="text-sm text-gray">A IA está sintetizando as respostas dos fóruns…</div>}
          {aiStatus === 'pending' && <div className="text-sm text-gray">As respostas foram agrupadas abaixo. A resposta combinada por IA requer a chave de IA configurada.</div>}
          {aiStatus === 'failed' && <div className="text-sm text-alert">Falha ao sintetizar. As respostas por fórum estão abaixo.</div>}
          {(ai.ai_answer ?? data.question.ai_answer) && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">{ai.ai_answer ?? data.question.ai_answer}</p>
          )}
          {renderList('Por fórum', (ai.ai_per_source ?? data.question.ai_per_source)?.map((p) => `${p.forum}: ${p.stance}${p.note ? ` — ${p.note}` : ''}`))}
          {renderList('Contradições', ai.ai_contradictions ?? data.question.ai_contradictions)}
          {renderList('Ressalvas', ai.ai_caveats ?? data.question.ai_caveats)}
        </section>

        {/* Respostas por fórum */}
        <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-gray">Respostas por fórum</h2>
        {answers.length === 0 && (
          <EmptyState icon="🔎" title="Procurando respostas…" hint="Assim que os fóruns responderem, elas aparecem aqui ao vivo." />
        )}
        {forums.map((forum) => (
          <div key={forum} className="mb-4">
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className="text-sm font-semibold">{forum}</span>
              {byForum[forum][0]?.source_class && <span className="chip bg-panel2 text-gray-muted">{CLASS_LABEL[byForum[forum][0].source_class!] ?? byForum[forum][0].source_class}</span>}
              <span className="text-xs text-gray-muted">{byForum[forum].length}</span>
            </div>
            {byForum[forum].map((a) => (
              <div key={a.id} className="card mb-2 p-3">
                {a.title && <div className="mb-1 text-sm font-medium text-white">{a.title}</div>}
                <p className="line-clamp-4 text-sm text-gray">{a.excerpt}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-muted">
                  {a.author && <span>@{a.author}</span>}
                  {typeof a.score === 'number' && <span>· {a.score} votos</span>}
                  {typeof a.relevance === 'number' && <span>· {a.relevance}% relev.</span>}
                  <a href={a.url} target="_blank" rel="noreferrer" className="ml-auto text-yellow">ver no fórum ↗</a>
                </div>
              </div>
            ))}
          </div>
        ))}

        <p className="mt-4 text-center text-xs text-gray-muted">
          Respostas agregadas de conteúdo público, com atribuição e link direto à origem.
        </p>
      </div>
    </div>
  );
}

function renderList(label: string, items?: string[]) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold text-gray-muted">{label}</div>
      <ul className="list-inside list-disc text-sm text-gray">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}

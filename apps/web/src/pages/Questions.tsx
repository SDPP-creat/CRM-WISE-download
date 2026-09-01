import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type QuestionListItem } from '../api.js';
import { useAuth } from '../store.js';
import { Spinner, EmptyState, timeAgo } from '../components/ui.js';
import { IconSearch } from '../components/icons.js';

export function Questions() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<QuestionListItem[] | null>(null);

  useEffect(() => {
    if (user) api.questions().then((r) => setList(r.questions)).catch(() => setList([]));
    else setList([]);
  }, [user]);

  const ask = async () => {
    if (text.trim().length < 8) { setError('Escreva uma pergunta com pelo menos 8 caracteres.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.createQuestion(text.trim());
      nav(`/pergunta/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pt-5">
      <h1 className="mb-1 text-xl font-bold">Perguntar aos fóruns</h1>
      <p className="mb-4 text-sm text-gray">
        Escreva sua dúvida. O WISE NEWS busca respostas em Reddit, Stack Overflow, GitHub e outros
        fóruns, junta tudo mostrando <b>de qual fórum veio</b> cada resposta e monta uma resposta combinada — ao vivo.
      </p>

      {!user ? (
        <div className="card p-4 text-center">
          <p className="mb-3 text-sm text-gray">Entre para fazer perguntas e acompanhar as respostas.</p>
          <Link to="/login" className="btn-primary inline-flex px-6 py-2">Entrar</Link>
        </div>
      ) : (
        <div className="card mb-6 p-4">
          <textarea
            className="input min-h-[110px] resize-none"
            placeholder="Ex.: Meu WABA foi restrito logo após aprovar o nome de exibição. Como resolver?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
          />
          {error && <div className="mt-2 text-sm text-alert">{error}</div>}
          <button onClick={ask} disabled={busy} className="btn-primary mt-3 w-full py-3">
            <IconSearch width={17} height={17} /> {busy ? 'Buscando nos fóruns…' : 'Perguntar e agregar respostas'}
          </button>
          <p className="mt-2 text-center text-xs text-gray-muted">
            Não é preciso conta nos fóruns — buscamos apenas conteúdo público.
          </p>
        </div>
      )}

      {user && (
        <>
          <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-gray">Minhas perguntas</h2>
          {list === null && <Spinner />}
          {list && list.length === 0 && <EmptyState icon="💬" title="Nenhuma pergunta ainda" hint="Faça sua primeira pergunta acima." />}
          {list && list.map((q) => (
            <Link key={q.id} to={`/pergunta/${q.id}`} className="card mb-2 block p-4">
              <div className="text-sm font-medium">{q.text}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-muted">
                <span className="chip bg-panel2 text-gray">{q.answers_count} respostas</span>
                <span className={`chip ${q.ai_status === 'done' ? 'bg-confirmed/15 text-confirmed' : 'bg-panel2 text-gray'}`}>
                  {aiStatusLabel(q.ai_status)}
                </span>
                <span className="ml-auto">{timeAgo(q.created_at)}</span>
              </div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

function aiStatusLabel(s: string): string {
  return { pending: 'aguardando IA', processing: 'sintetizando…', done: 'respondida', failed: 'falha na IA' }[s] ?? s;
}

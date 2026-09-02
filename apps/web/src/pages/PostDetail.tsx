import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { categoryLabel } from '@wise-news/shared';
import { Flag } from '../components/Flag.js';
import { api, type PostDetail as Detail } from '../api.js';
import { ImpactBadge, VerificationBadge, ConfidenceBadge, Spinner, EmptyState, timeAgo } from '../components/ui.js';
import { IconArrowLeft, IconBookmark, IconArrowUpRight } from '../components/icons.js';
import { useBookmarks } from '../useBookmarks.js';

const ACTION_LABEL: Record<string, string> = {
  act_now: 'Agir agora', controlled_test: 'Fazer teste controlado', monitor: 'Apenas monitorar', no_action: 'Nenhuma mudança necessária',
};

export function PostDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isSaved, toggle } = useBookmarks();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    if (!id) return;
    setData(null);
    api.post(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="p-4"><EmptyState icon="⚠️" title="Não foi possível abrir" hint={error} /></div>;
  if (!data) return <Spinner label="Carregando dossiê…" />;

  const p = data.post;
  const numId = Number(id);
  const titlePt = data.translation?.title_pt || (p.title as string);
  const wise = data.wise_analysis;
  const arr = (v: unknown): string[] => Array.isArray(v) ? (v as string[]) : [];

  return (
    <div className="pb-24">
      {/* Cabeçalho */}
      <header className="safe-top sticky top-0 z-20 flex items-center gap-2 bg-bg/95 px-3 py-3 backdrop-blur">
        <button onClick={() => nav(-1)} className="tap rounded-lg px-2 text-gray"><IconArrowLeft width={20} height={20} /></button>
        <span className="text-sm text-gray">Dossiê</span>
        <button onClick={() => toggle(numId)} className={`tap ml-auto flex items-center gap-1.5 rounded-lg px-3 text-sm ${isSaved(numId) ? 'text-yellow' : 'text-gray'}`}><IconBookmark width={15} height={15} filled={isSaved(numId)} /> {isSaved(numId) ? 'Salvo' : 'Salvar'}</button>
      </header>

      <div className="px-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray">
          <Flag code={String(p.country_code ?? '')} name={String(p.country_name ?? '')} size={20} />
          <span>{p.country_name}</span>
          <span className="chip bg-panel2 text-yellow">{categoryLabel(String(p.category_primary ?? ''))}</span>
          <span>· {timeAgo(String(p.created_at))}</span>
        </div>
        <h1 className="mb-2 text-xl font-bold leading-snug">{titlePt}</h1>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <VerificationBadge status={p.verification_status as string} />
          <ImpactBadge impact={p.impact as string} />
          <ConfidenceBadge confidence={p.confidence as string} />
        </div>
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-muted">
          <span>{String(p.source_name)}</span><span>·</span><span>@{String(p.author)}</span>
          <a href={String(p.url)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-yellow">Abrir original <IconArrowUpRight width={13} height={13} /></a>
        </div>

        {p.processing_status === 'pending' && (
          <div className="card mb-4 border-yellow/30 bg-yellow/5 p-3 text-sm text-yellow">
            ⏳ Análise por IA pendente (chave de IA não configurada). O conteúdo original já está disponível abaixo.
          </div>
        )}

        {/* 1. Publicação original */}
        <Block title="Publicação original">
          <div className="mb-2 flex gap-2">
            <button onClick={() => setShowOriginal(false)} className={`chip tap px-3 ${!showOriginal ? 'bg-yellow text-black' : 'bg-panel2 text-gray'}`}>Tradução</button>
            <button onClick={() => setShowOriginal(true)} className={`chip tap px-3 ${showOriginal ? 'bg-yellow text-black' : 'bg-panel2 text-gray'}`}>Ver original {p.lang ? `(${p.lang})` : ''}</button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray">
            {showOriginal ? (p.body as string) : (data.summary?.short_summary || (p.body as string))}
          </p>
        </Block>

        {/* 3. Resumo do autor */}
        {data.summary && (data.summary.problem || arr(data.summary.attempts).length > 0) && (
          <Block title="Resumo do autor">
            {data.summary.problem && <Field label="Problema">{data.summary.problem}</Field>}
            {arr(data.summary.attempts).length > 0 && <ListField label="Tentativas" items={arr(data.summary.attempts)} />}
            {data.summary.result && <Field label="Resultado">{data.summary.result}</Field>}
            {arr(data.summary.evidence).length > 0 && <ListField label="Evidências" items={arr(data.summary.evidence)} />}
            {arr(data.summary.open_questions).length > 0 && <ListField label="Perguntas em aberto" items={arr(data.summary.open_questions)} />}
          </Block>
        )}

        {/* 4. Pessoas e comentários relevantes */}
        {data.participants.length > 0 && (
          <Block title="Pessoas e comentários relevantes">
            {data.participants.map((c, i) => (
              <div key={i} className="mb-3 rounded-xl bg-panel2 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-semibold text-white">@{String(c.author)}</span>
                  <span className="chip bg-panel text-gray">{roleLabel(String(c.role))}</span>
                  {c.evidence_type ? <span className="chip bg-panel text-gray-muted">{evidenceLabel(String(c.evidence_type))}</span> : null}
                </div>
                {c.summary_pt ? <p className="text-sm text-gray">{String(c.summary_pt)}</p> : null}
                {c.translation_pt ? <p className="mt-1 text-xs italic text-gray-muted">“{String(c.translation_pt)}”</p> : null}
                {c.why_relevant ? <p className="mt-1 text-xs text-gray-muted">Por que é relevante: {String(c.why_relevant)}</p> : null}
                {c.comment_url ? <a href={String(c.comment_url)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-yellow">ver comentário ↗</a> : null}
              </div>
            ))}
          </Block>
        )}

        {/* 5. Conferência entre fontes */}
        {(data.related.length > 0 || data.evidence.length > 0) && (
          <Block title="Conferência entre fontes">
            {data.related.length > 0 && (
              <>
                <div className="mb-1 text-xs text-gray">{data.related.length} relato(s) semelhante(s):</div>
                {data.related.map((r) => (
                  <Link key={r.id} to={`/post/${r.id}`} className="mb-1 block text-sm text-yellow">• {r.title} <span className="text-gray-muted">({r.source_name})</span></Link>
                ))}
              </>
            )}
            {data.evidence.map((e, i) => (
              <a key={i} href={String(e.url)} target="_blank" rel="noreferrer" className="mb-1 block text-sm text-yellow">
                {e.kind === 'contradiction' ? '⚠ Contradição: ' : '✔ Apoio: '}{String(e.label || e.url)}
              </a>
            ))}
          </Block>
        )}

        {/* 6. Análise da Wise */}
        {wise && (
          <div className="card mb-4 border-yellow/30 p-4">
            <h2 className="mb-2 text-sm font-bold text-yellow">O que isso pode mudar na operação da Wise?</h2>
            {wise.conclusion ? <p className="mb-3 text-sm text-white">{String(wise.conclusion)}</p> : null}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <ImpactBadge impact={wise.impact as string} />
              <ConfidenceBadge confidence={wise.confidence as string} />
              {wise.action_type ? <span className="chip bg-panel2 text-yellow">{ACTION_LABEL[String(wise.action_type)] ?? String(wise.action_type)}</span> : null}
            </div>
            {arr(wise.affected_areas).length > 0 && <ListField label="Áreas afetadas" items={arr(wise.affected_areas)} />}
            {arr(wise.recommended_actions).length > 0 && <ListField label="O que fazer" items={arr(wise.recommended_actions)} />}
            {arr(wise.actions_to_avoid).length > 0 && <ListField label="O que NÃO fazer" items={arr(wise.actions_to_avoid)} />}
            {wise.operational_risk ? <Field label="Risco de mudar a operação">{String(wise.operational_risk)}</Field> : null}
            {wise.reasoning ? <Field label="Fundamentação">{String(wise.reasoning)}</Field> : null}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-gray-muted">
          Conteúdo original em {String(p.source_name)}. WISE NEWS mantém atribuição e link direto à fonte.
        </p>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mb-4 p-4">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-2"><div className="text-xs font-semibold text-gray-muted">{label}</div><div className="text-sm text-gray">{children}</div></div>;
}
function ListField({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-2">
      <div className="text-xs font-semibold text-gray-muted">{label}</div>
      <ul className="list-inside list-disc text-sm text-gray">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}
function roleLabel(r: string): string { return r === 'author' ? 'autor' : r === 'reply' ? 'resposta' : 'comentarista'; }
function evidenceLabel(e: string): string { return { experience: 'experiência', documentation: 'documentação', code: 'código/erro', opinion: 'opinião' }[e] ?? e; }

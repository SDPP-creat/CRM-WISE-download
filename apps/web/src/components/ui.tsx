import type { ReactNode } from 'react';

/** Marca em texto (sem badge): WISE (ivory) NEWS (dourado), tipografia Sora. */
export function Logo({ size = 'md', tagline = true }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean; width?: number }) {
  const cls = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl';
  return (
    <div aria-label="WISE NEWS" className="flex flex-col leading-none">
      <div className={`font-display font-extrabold tracking-tight ${cls}`}>
        <span className="text-ivory">WISE</span>&nbsp;<span className="text-gold">NEWS</span>
      </div>
      {tagline && (
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-gray-muted">Radar da API Oficial</div>
      )}
    </div>
  );
}

const IMPACT: Record<string, { label: string; cls: string }> = {
  critical: { label: 'Crítico', cls: 'bg-alert/15 text-alert' },
  high: { label: 'Alto', cls: 'bg-orange-500/15 text-orange-400' },
  medium: { label: 'Médio', cls: 'bg-yellow/15 text-yellow' },
  low: { label: 'Baixo', cls: 'bg-gray/10 text-gray' },
};
export function ImpactBadge({ impact }: { impact?: string | null }) {
  if (!impact) return null;
  const it = IMPACT[impact] ?? IMPACT.low;
  return <span className={`chip ${it.cls}`}>Impacto: {it.label}</span>;
}

const VERIF: Record<string, { label: string; cls: string }> = {
  confirmed_official: { label: 'Confirmado oficialmente', cls: 'bg-confirmed/15 text-confirmed' },
  confirmed_multiple: { label: 'Confirmado por várias fontes', cls: 'bg-confirmed/15 text-confirmed' },
  consistent_report: { label: 'Relato consistente', cls: 'bg-yellow/15 text-yellow' },
  isolated_report: { label: 'Relato isolado', cls: 'bg-gray/10 text-gray' },
  unconfirmed: { label: 'Não confirmado', cls: 'bg-gray/10 text-gray' },
  rumor: { label: 'Rumor', cls: 'bg-alert/10 text-alert' },
  promotional: { label: 'Promocional', cls: 'bg-gray/10 text-gray-muted' },
  outdated: { label: 'Desatualizado', cls: 'bg-gray/10 text-gray-muted' },
};
export function VerificationBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const v = VERIF[status] ?? VERIF.unconfirmed;
  return <span className={`chip ${v.cls}`}>{v.label}</span>;
}

const CONF: Record<string, string> = { high: 'Confiança alta', medium: 'Confiança média', low: 'Confiança baixa' };
export function ConfidenceBadge({ confidence }: { confidence?: string | null }) {
  if (!confidence) return null;
  return <span className="chip bg-panel2 text-gray">{CONF[confidence] ?? confidence}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-yellow" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function EmptyState({ title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-panel2 text-gray-muted">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" />
        </svg>
      </div>
      <div className="font-semibold">{title}</div>
      {hint && <div className="max-w-xs text-sm text-gray">{hint}</div>}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-gray">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

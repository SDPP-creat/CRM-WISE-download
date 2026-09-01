import { logoSvg } from '@wise-news/ui';
import type { ReactNode } from 'react';

export function Logo({ width = 160 }: { width?: number }) {
  return <div aria-label="WISE NEWS" dangerouslySetInnerHTML={{ __html: logoSvg({ width, withText: true }) }} />;
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

export function EmptyState({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="font-semibold">{title}</div>
      {hint && <div className="text-sm text-gray max-w-xs">{hint}</div>}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray">{title}</h2>
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

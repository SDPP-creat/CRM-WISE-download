/**
 * Bandeira do país como IMAGEM (não emoji) — emoji de bandeira não renderiza no
 * Windows. Usa flagcdn.com (cacheado pelo service worker). "GLOBAL"/inválido =>
 * ícone de globo. Mantém a regra do produto: exatamente uma bandeira por post.
 */
type Props = { code?: string | null; name?: string; size?: number; className?: string };

export function Flag({ code, name, size = 20, className = '' }: Props) {
  const cc = (code ?? '').toUpperCase();
  const valid = /^[A-Z]{2}$/.test(cc) && cc !== 'GLOBAL';
  const h = Math.round((size * 3) / 4);
  if (!valid) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`text-gold ${className}`} aria-label={name || 'Global'} role="img">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" />
      </svg>
    );
  }
  return (
    <img
      src={`https://flagcdn.com/w40/${cc.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/w80/${cc.toLowerCase()}.png 2x`}
      width={size}
      height={h}
      alt={name || cc}
      title={name || cc}
      loading="lazy"
      className={`inline-block rounded-[2px] object-cover align-middle ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: h }}
    />
  );
}

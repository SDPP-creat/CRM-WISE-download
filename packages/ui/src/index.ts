/** Tokens de identidade visual e ativos (logo/ícones) da WISE NEWS. */

export const THEME = {
  bg: '#050505',
  bgSecondary: '#101010',
  yellow: '#FFD400',
  white: '#FFFFFF',
  gray: '#9CA3AF',
  green: '#22C55E', // apenas informações confirmadas
  red: '#EF4444', // apenas alertas e restrições
} as const;

export const IMPACT_COLORS: Record<string, string> = {
  critical: THEME.red,
  high: '#F97316',
  medium: THEME.yellow,
  low: THEME.gray,
};

/** Monograma "W" geométrico (traço único, cantos retos) — a marca da empresa. */
function wMark(color: string, stroke = 11): string {
  return `<path d="M14 24 L30 76 L50 40 L70 76 L86 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="miter" stroke-linecap="butt"/>`;
}

/**
 * Logo: badge quadrado com o "W" amarelo + wordmark "WISE" (branco) "NEWS"
 * (amarelo). Sem radar, sem ponto — só o W da empresa e o nome.
 */
export function logoSvg(options: { width?: number; withText?: boolean } = {}): string {
  const { width = 200, withText = true } = options;
  const viewW = withText ? 310 : 100;
  const viewH = 100;
  const height = Math.round((width * viewH) / viewW);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewW} ${viewH}" role="img" aria-label="WISE NEWS">
  <g transform="translate(6 6) scale(0.88)">
    <rect x="0" y="0" width="100" height="100" rx="24" fill="${THEME.bgSecondary}" stroke="#26261a" stroke-width="2"/>
    ${wMark(THEME.yellow, 11)}
  </g>
  ${withText ? `<g font-family="Inter,Segoe UI,system-ui,sans-serif">
    <text x="112" y="56" font-size="33" font-weight="800" letter-spacing="-0.5" fill="${THEME.white}">WISE</text>
    <text x="197" y="56" font-size="33" font-weight="800" letter-spacing="-0.5" fill="${THEME.yellow}">NEWS</text>
    <text x="113" y="78" font-size="10" letter-spacing="2.1" fill="${THEME.gray}">RADAR DA API OFICIAL</text>
  </g>` : ''}
</svg>`;
}

/** Ícone quadrado (favicon / PWA): badge escuro com o W amarelo. */
export function iconSvg(size = 512, opts: { rounded?: boolean } = {}): string {
  const r = opts.rounded === false ? 0 : 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="WISE NEWS">
  <rect width="100" height="100" rx="${r}" fill="${THEME.bg}"/>
  <g transform="translate(2 4) scale(0.96)">${wMark(THEME.yellow, 11)}</g>
</svg>`;
}

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

/**
 * Logo original (não usa marca do WhatsApp/Meta). Símbolo "W" com ondas de
 * radar/transmissão. "WISE" branco + "NEWS" amarelo.
 */
export function logoSvg(options: { width?: number; withText?: boolean } = {}): string {
  const { width = 200, withText = true } = options;
  const height = withText ? Math.round(width * 0.32) : width;
  const viewW = withText ? 320 : 100;
  const viewH = withText ? 104 : 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewW} ${viewH}" role="img" aria-label="WISE NEWS">
  <g fill="none" stroke="${THEME.yellow}" stroke-width="5" stroke-linecap="round" opacity="0.9">
    <path d="M50 52 a20 20 0 0 1 0 -0.1" />
    <path d="M28 60 a30 30 0 0 1 44 0" opacity="0.55"/>
    <path d="M18 68 a44 44 0 0 1 64 0" opacity="0.30"/>
  </g>
  <path d="M22 26 L34 74 L50 42 L66 74 L78 26" fill="none" stroke="${THEME.white}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="50" cy="24" r="5" fill="${THEME.yellow}"/>
  ${withText ? `<text x="100" y="58" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="34" font-weight="800" fill="${THEME.white}">WISE</text>
  <text x="196" y="58" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="34" font-weight="800" fill="${THEME.yellow}">NEWS</text>
  <text x="101" y="80" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="12.5" letter-spacing="3" fill="${THEME.gray}">RADAR DA API OFICIAL</text>` : ''}
</svg>`;
}

/** Ícone quadrado para favicon / PWA (fundo escuro + W). */
export function iconSvg(size = 512): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="WISE NEWS">
  <rect width="100" height="100" rx="22" fill="${THEME.bg}"/>
  <g fill="none" stroke="${THEME.yellow}" stroke-width="4" stroke-linecap="round">
    <path d="M30 64 a30 30 0 0 1 40 0" opacity="0.5"/>
    <path d="M22 72 a42 42 0 0 1 56 0" opacity="0.28"/>
  </g>
  <path d="M24 28 L35 74 L50 44 L65 74 L76 28" fill="none" stroke="${THEME.white}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="50" cy="26" r="5" fill="${THEME.yellow}"/>
</svg>`;
}

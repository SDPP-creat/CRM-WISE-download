/**
 * País e bandeira. Cada notícia exibe EXATAMENTE uma bandeira, ou o marcador
 * global 🌐 quando não for possível confirmar um país (nunca inventar origem).
 */

export const GLOBAL_CODE = 'GLOBAL' as const;
export const GLOBAL_FLAG = '🌐' as const;
export const GLOBAL_NAME = 'Global' as const;

/** Nomes de países em pt-BR, indexados por ISO 3166-1 alpha-2 (maiúsculo). */
export const COUNTRY_NAMES_PT: Record<string, string> = {
  BR: 'Brasil', US: 'Estados Unidos', GB: 'Reino Unido', PT: 'Portugal',
  ES: 'Espanha', FR: 'França', DE: 'Alemanha', IT: 'Itália', IN: 'Índia',
  ID: 'Indonésia', TR: 'Turquia', SA: 'Arábia Saudita', AE: 'Emirados Árabes Unidos',
  EG: 'Egito', JP: 'Japão', CN: 'China', MX: 'México', AR: 'Argentina',
  CO: 'Colômbia', CL: 'Chile', PE: 'Peru', NG: 'Nigéria', ZA: 'África do Sul',
  KE: 'Quênia', PK: 'Paquistão', BD: 'Bangladesh', PH: 'Filipinas', VN: 'Vietnã',
  TH: 'Tailândia', MY: 'Malásia', SG: 'Singapura', NL: 'Países Baixos',
  BE: 'Bélgica', SE: 'Suécia', NO: 'Noruega', DK: 'Dinamarca', FI: 'Finlândia',
  PL: 'Polônia', RU: 'Rússia', UA: 'Ucrânia', CA: 'Canadá', AU: 'Austrália',
  NZ: 'Nova Zelândia', IE: 'Irlanda', CH: 'Suíça', AT: 'Áustria', GR: 'Grécia',
  IL: 'Israel', QA: 'Catar', KW: 'Kuwait', MA: 'Marrocos', DZ: 'Argélia',
  EC: 'Equador', UY: 'Uruguai', PY: 'Paraguai', BO: 'Bolívia', VE: 'Venezuela',
  GT: 'Guatemala', DO: 'República Dominicana', CR: 'Costa Rica', PA: 'Panamá',
  RO: 'Romênia', CZ: 'Tchéquia', HU: 'Hungria', KR: 'Coreia do Sul',
  LK: 'Sri Lanka', NP: 'Nepal', GH: 'Gana', TZ: 'Tanzânia', UG: 'Uganda',
};

/** Domínios de topo regionais -> país, usado como último critério de origem. */
export const TLD_TO_COUNTRY: Record<string, string> = {
  br: 'BR', pt: 'PT', es: 'ES', mx: 'MX', ar: 'AR', co: 'CO', cl: 'CL',
  uk: 'GB', in: 'IN', id: 'ID', tr: 'TR', sa: 'SA', ae: 'AE', eg: 'EG',
  jp: 'JP', cn: 'CN', de: 'DE', fr: 'FR', it: 'IT', ng: 'NG', za: 'ZA',
  ke: 'KE', pk: 'PK', bd: 'BD', ph: 'PH', vn: 'VN', th: 'TH', my: 'MY',
  ru: 'RU', ua: 'UA', ca: 'CA', au: 'AU', nz: 'NZ', ma: 'MA', dz: 'DZ',
};

/**
 * Converte um código ISO alpha-2 na bandeira emoji correspondente somando o
 * offset dos "regional indicator symbols". Retorna 🌐 para GLOBAL/inválido.
 */
export function flagEmoji(code: string | null | undefined): string {
  if (!code) return GLOBAL_FLAG;
  const upper = code.toUpperCase();
  if (upper === GLOBAL_CODE) return GLOBAL_FLAG;
  if (!/^[A-Z]{2}$/.test(upper)) return GLOBAL_FLAG;
  const A = 0x1f1e6;
  const first = A + (upper.charCodeAt(0) - 65);
  const second = A + (upper.charCodeAt(1) - 65);
  return String.fromCodePoint(first, second);
}

/** Nome do país em pt-BR, ou "Global" para GLOBAL/desconhecido. */
export function countryName(code: string | null | undefined): string {
  if (!code) return GLOBAL_NAME;
  const upper = code.toUpperCase();
  if (upper === GLOBAL_CODE) return GLOBAL_NAME;
  return COUNTRY_NAMES_PT[upper] ?? upper;
}

export function isValidCountryCode(code: string): boolean {
  const upper = code.toUpperCase();
  return upper === GLOBAL_CODE || /^[A-Z]{2}$/.test(upper);
}

import { COUNTRY_NAMES_PT, GLOBAL_CODE, TLD_TO_COUNTRY, isValidCountryCode } from './countries.js';
import { tldOf } from './text.js';

/**
 * Detecção de país por heurística (fallback sem IA), seguindo a prioridade da
 * especificação. NUNCA determina país apenas pelo idioma; sem confiança -> GLOBAL.
 */

export interface CountryDetection {
  code: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// Menções diretas de país no texto (pt/en/es) -> ISO alpha-2.
const COUNTRY_MENTIONS: Array<[RegExp, string]> = [
  [/\b(brasil|brazil|brazilian|brasileir[oa])\b/i, 'BR'],
  [/\b(portugal|português de portugal|lisboa)\b/i, 'PT'],
  [/\b(united states|estados unidos|u\.s\.a?|américa do norte)\b/i, 'US'],
  [/\b(united kingdom|reino unido|england|inglaterra|londres|london)\b/i, 'GB'],
  [/\b(españa|spain|espanha|madrid)\b/i, 'ES'],
  [/\b(méxico|mexico|mexican[oa])\b/i, 'MX'],
  [/\b(argentin[ao]|buenos aires)\b/i, 'AR'],
  [/\b(colombia|colômbia)\b/i, 'CO'],
  [/\b(índia|india|indian)\b/i, 'IN'],
  [/\b(indonesia|indonésia)\b/i, 'ID'],
  [/\b(turkey|turquia|türkiye)\b/i, 'TR'],
  [/\b(germany|alemanha|deutschland)\b/i, 'DE'],
  [/\b(france|frança|paris)\b/i, 'FR'],
  [/\b(italy|itália|italia)\b/i, 'IT'],
  [/\b(nigeria|nigéria)\b/i, 'NG'],
  [/\b(south africa|áfrica do sul)\b/i, 'ZA'],
  [/\b(pakistan|paquistão)\b/i, 'PK'],
  [/\b(philippines|filipinas)\b/i, 'PH'],
  [/\b(saudi arabia|arábia saudita)\b/i, 'SA'],
  [/\b(united arab emirates|emirados árabes|u\.a\.e|dubai)\b/i, 'AE'],
  [/\b(egypt|egito)\b/i, 'EG'],
];

export interface CountryDetectInput {
  text: string;
  authorLocationHint?: string;
  sourceDomain?: string; // ex.: "example.com.br"
}

export function detectCountry(input: CountryDetectInput): CountryDetection {
  const text = input.text ?? '';

  // 1) País mencionado diretamente na publicação (mais confiável).
  for (const [re, code] of COUNTRY_MENTIONS) {
    if (re.test(text)) {
      return { code, confidence: 'high', reason: `País mencionado diretamente no texto (${COUNTRY_NAMES_PT[code] ?? code}).` };
    }
  }

  // 4) Localização pública informada pelo autor.
  if (input.authorLocationHint) {
    for (const [re, code] of COUNTRY_MENTIONS) {
      if (re.test(input.authorLocationHint)) {
        return { code, confidence: 'medium', reason: 'Localização pública informada pelo autor.' };
      }
    }
  }

  // 5) Domínio regional da fonte (último critério).
  const tld = input.sourceDomain
    ? input.sourceDomain.split('.').pop()?.toLowerCase() ?? null
    : tldOf(text.includes('http') ? text : '') ;
  if (tld && TLD_TO_COUNTRY[tld]) {
    return { code: TLD_TO_COUNTRY[tld], confidence: 'low', reason: `Domínio regional da fonte (.${tld}).` };
  }

  // Sem confiança -> Global. Nunca inventar origem.
  return { code: GLOBAL_CODE, confidence: 'low', reason: 'Não foi possível confirmar um país; conteúdo tratado como global.' };
}

/**
 * Sanitiza o país devolvido pela IA. Só aceita GLOBAL ou um código ISO que
 * conheçamos (COUNTRY_NAMES_PT); qualquer outro vira GLOBAL — nunca inventar
 * origem a partir de um código desconhecido/reservado (ex.: "ZZ").
 */
export function normalizeCountryCode(code: string): string {
  let upper = (code || '').toUpperCase();
  if (!upper) return GLOBAL_CODE;
  if (upper === 'UK') upper = 'GB';
  if (upper === GLOBAL_CODE) return GLOBAL_CODE;
  if (!isValidCountryCode(upper)) return GLOBAL_CODE;
  return upper in COUNTRY_NAMES_PT ? upper : GLOBAL_CODE;
}

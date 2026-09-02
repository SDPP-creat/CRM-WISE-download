/** Utilidades de texto: hash, URL canônica, similaridade e idioma (heurística). */

/** Hash estável (FNV-1a 64-bit -> hex) para detectar duplicidade por conteúdo. */
export function contentHash(input: string): string {
  const normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= BigInt(normalized.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Normaliza uma URL para forma canônica (remove tracking, barra final, host lower). */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    // remove barra final do caminho (antes da query) para estabilidade
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'ref_src', 'ref_url'];
    for (const key of drop) u.searchParams.delete(key);
    // ordena params para estabilidade
    u.searchParams.sort();
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

/** Extrai o TLD (última parte) de uma URL, em minúsculas. */
export function tldOf(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    const parts = host.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

const tokenRegex = /[\p{L}\p{N}]+/gu;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(tokenRegex) ?? []).filter((t) => t.length > 1);
}

/** Similaridade de Jaccard entre dois textos (0..1) baseada em tokens. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return inter / union;
}

/**
 * Detecção de idioma por heurística leve (stopwords/diacríticos/scripts). Não
 * substitui a IA — serve como best-effort quando não há chave de IA.
 */
export function detectLanguage(text: string): string {
  const t = text.toLowerCase();
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[぀-ヿ一-龯]/.test(text)) return /[぀-ヿ]/.test(text) ? 'ja' : 'zh';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  const scores: Record<string, number> = { pt: 0, es: 0, en: 0, fr: 0, de: 0, it: 0, tr: 0, id: 0 };
  const marks: Record<string, RegExp[]> = {
    pt: [/\b(não|você|está|também|então|português|empresa|conta|mensagem|limite)\b/g, /ção\b/g],
    es: [/\b(está|también|cuenta|mensaje|empresa|número|verificación|pero)\b/g, /ción\b/g, /¿|¡/g],
    en: [/\b(the|and|account|message|business|verification|number|template)\b/g],
    fr: [/\b(les|des|compte|message|entreprise|numéro|vérification|mais)\b/g],
    de: [/\b(und|das|nachricht|konto|unternehmen|nummer|nicht|über)\b/g],
    it: [/\b(non|account|messaggio|azienda|numero|verifica|però)\b/g],
    tr: [/\b(ve|hesap|mesaj|işletme|numara|doğrulama|ama)\b/g],
    id: [/\b(dan|akun|pesan|bisnis|nomor|verifikasi|tapi)\b/g],
  };
  for (const [lang, regs] of Object.entries(marks)) {
    for (const re of regs) scores[lang] += (t.match(re) ?? []).length;
  }
  let best = 'en';
  let bestScore = 0;
  for (const [lang, s] of Object.entries(scores)) {
    if (s > bestScore) {
      bestScore = s;
      best = lang;
    }
  }
  return bestScore === 0 ? 'en' : best;
}

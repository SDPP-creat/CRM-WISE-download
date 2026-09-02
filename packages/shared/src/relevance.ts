import type { NormalizedComment } from './types.js';

/**
 * Pontuação de relevância de comentários (seção 9). Popularidade NÃO é prova de
 * verdade — é apenas um dos sinais. Comentários com poucos votos podem entrar
 * quando trazem evidência forte. Descarta ruído óbvio (vazio, propaganda, DM).
 */

export interface RelevanceSignals {
  onTopic: boolean;
  hasExperience: boolean;
  hasEvidenceLink: boolean;
  hasCodeOrError: boolean;
  hasUpdate: boolean;
  score: number; // votos
  isRecent: boolean;
}

const NOISE_PATTERNS = [
  /\bdm me\b/i, /\bmande?\s*dm\b/i, /\bhit me up\b/i, /\bwhatsapp me\b/i,
  /\b(giveaway|free followers|buy followers|promo code)\b/i,
  /^(lol|kkk+|haha+|\+1|this|same|thanks|obrigado)[.!\s]*$/i,
];

const TOPIC_HINTS = [
  /whatsapp/i, /waba/i, /business (manager|verification|platform)/i, /cloud api/i,
  /template/i, /quality rating/i, /messaging limit|limite/i, /account (restricted|integrity)/i,
  /display name|nome de exibição/i, /bsp|infobip|twilio|gupshup|360dialog/i,
];

export function isNoiseComment(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.length < 12) return true;
  return NOISE_PATTERNS.some((re) => re.test(trimmed));
}

export function commentSignals(comment: NormalizedComment, now = Date.now()): RelevanceSignals {
  const body = comment.body ?? '';
  const created = Date.parse(comment.createdAt);
  const ageDays = Number.isNaN(created) ? 999 : (now - created) / 86_400_000;
  return {
    onTopic: TOPIC_HINTS.some((re) => re.test(body)),
    hasExperience: /\b(i (had|got|tried|contacted|received|solved)|na minha conta|no meu waba|resolvi|consegui)\b/i.test(body),
    hasEvidenceLink: /https?:\/\/(developers\.facebook\.com|business\.facebook\.com|business\.whatsapp\.com|facebook\.com\/business\/help|metastatus\.com)/i.test(body),
    hasCodeOrError: /(error\s*code|#\d{3,}|\berror:|OAuthException|\(#\d+\)|status\s*code)/i.test(body),
    hasUpdate: /\b(update|edit|edito?:|atualização|resolvido|solved now)\b/i.test(body),
    score: comment.score ?? 0,
    isRecent: ageDays <= 30,
  };
}

/** Retorna uma pontuação 0..100. >= threshold => importar. */
export function relevanceScore(signals: RelevanceSignals): number {
  let score = 0;
  if (signals.onTopic) score += 25;
  if (signals.hasExperience) score += 20;
  if (signals.hasEvidenceLink) score += 25;
  if (signals.hasCodeOrError) score += 15;
  if (signals.hasUpdate) score += 10;
  if (signals.isRecent) score += 5;
  // votos: contribuição logarítmica e limitada (não é prova de verdade).
  if (signals.score > 0) score += Math.min(10, Math.round(Math.log2(signals.score + 1) * 2));
  if (signals.score < 0) score -= 5;
  return Math.max(0, Math.min(100, score));
}

export const RELEVANCE_THRESHOLD = 35;

export function isRelevantComment(comment: NormalizedComment, threshold = RELEVANCE_THRESHOLD): boolean {
  if (isNoiseComment(comment.body)) return false;
  return relevanceScore(commentSignals(comment)) >= threshold;
}

import { describe, it, expect } from 'vitest';
import {
  flagEmoji, countryName, GLOBAL_FLAG,
  detectCountry, normalizeCountryCode,
  canonicalizeUrl, contentHash, jaccardSimilarity, detectLanguage,
  isNoiseComment, relevanceScore, commentSignals, isRelevantComment,
} from '@wise-news/shared';
import type { NormalizedComment } from '@wise-news/shared';

describe('bandeira (flag)', () => {
  it('converte ISO alpha-2 em emoji de bandeira', () => {
    expect(flagEmoji('BR')).toBe('🇧🇷');
    expect(flagEmoji('us')).toBe('🇺🇸');
  });
  it('usa 🌐 para GLOBAL/valor inválido/vazio', () => {
    expect(flagEmoji('GLOBAL')).toBe(GLOBAL_FLAG);
    expect(flagEmoji('')).toBe(GLOBAL_FLAG);
    expect(flagEmoji('XYZ')).toBe(GLOBAL_FLAG);
    expect(flagEmoji(null)).toBe(GLOBAL_FLAG);
  });
  it('nome do país em pt-BR', () => {
    expect(countryName('BR')).toBe('Brasil');
    expect(countryName('GLOBAL')).toBe('Global');
  });
});

describe('detecção de país (heurística)', () => {
  it('prioriza menção direta no texto', () => {
    const r = detectCountry({ text: 'My WABA got restricted here in Brazil last week' });
    expect(r.code).toBe('BR');
    expect(r.confidence).toBe('high');
  });
  it('NUNCA determina país só pelo idioma → GLOBAL', () => {
    const r = detectCountry({ text: 'minha conta do whatsapp foi restrita sem motivo' });
    expect(r.code).toBe('GLOBAL');
  });
  it('usa localização do autor quando não há menção no texto', () => {
    const r = detectCountry({ text: 'account restricted', authorLocationHint: 'Lagos, Nigeria' });
    expect(r.code).toBe('NG');
    expect(r.confidence).toBe('medium');
  });
  it('normaliza UK -> GB e inválido -> GLOBAL', () => {
    expect(normalizeCountryCode('uk')).toBe('GB');
    expect(normalizeCountryCode('zzz')).toBe('GLOBAL');
  });
});

describe('deduplicação (utilidades)', () => {
  it('canonicaliza URLs removendo tracking e barra final', () => {
    const a = canonicalizeUrl('https://www.Reddit.com/r/x/comments/1/?utm_source=ig&b=2');
    const b = canonicalizeUrl('https://reddit.com/r/x/comments/1?b=2');
    expect(a).toBe(b);
  });
  it('hash estável para o mesmo conteúdo (ignora espaços/caixa)', () => {
    expect(contentHash('Hello  World')).toBe(contentHash('hello world'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });
  it('similaridade de título alta para quase-duplicatas', () => {
    const s = jaccardSimilarity('WABA restricted after display name approval', 'WABA restricted after the display name approval');
    expect(s).toBeGreaterThan(0.7);
  });
});

describe('detecção de idioma (heurística, não define país)', () => {
  it('reconhece português, inglês e espanhol', () => {
    expect(detectLanguage('minha conta não está funcionando também')).toBe('pt');
    expect(detectLanguage('the account and the business verification failed')).toBe('en');
    expect(detectLanguage('la cuenta está restringida, número no verificado')).toBe('es');
  });
  it('reconhece árabe e japonês por script', () => {
    expect(detectLanguage('حسابي مقيد')).toBe('ar');
    expect(detectLanguage('アカウントが制限されました')).toBe('ja');
  });
});

describe('relevância de comentários', () => {
  const base = { externalId: 'c', postExternalId: 'p', url: 'http://x', isReply: false, createdAt: new Date().toISOString() };
  it('descarta ruído (curto, DM, propaganda)', () => {
    expect(isNoiseComment('lol')).toBe(true);
    expect(isNoiseComment('DM me for promo')).toBe(true);
    expect(isNoiseComment('I had the same #131049 error and solved it via docs')).toBe(false);
  });
  it('pontua alto comentário com experiência + evidência (mesmo com poucos votos)', () => {
    const c: NormalizedComment = { ...base, author: 'u', score: 1, body: 'I contacted support and got error #131049; docs at https://developers.facebook.com/docs/whatsapp' };
    expect(relevanceScore(commentSignals(c))).toBeGreaterThanOrEqual(35);
    expect(isRelevantComment(c)).toBe(true);
  });
  it('popularidade sozinha não garante relevância', () => {
    const c: NormalizedComment = { ...base, author: 'u', score: 999, body: 'this is great, congrats everyone here' };
    expect(isRelevantComment(c)).toBe(false);
  });
});

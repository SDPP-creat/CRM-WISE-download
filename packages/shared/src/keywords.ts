/**
 * Biblioteca inicial de palavras-chave em vários idiomas. O painel admin pode
 * adicionar/remover/traduzir/pesar termos (tabela system_settings/keywords).
 */

export interface KeywordSeed {
  term: string;
  lang: string;
  weight: number; // 1 (fraco) .. 5 (forte)
  topic?: string; // slug de categoria associada
  negative?: boolean; // palavra negativa: derruba a relevância
}

export const KEYWORDS: KeywordSeed[] = [
  // Inglês — núcleo
  { term: 'WhatsApp Official API', lang: 'en', weight: 5, topic: 'api-oficial' },
  { term: 'WhatsApp Business Platform', lang: 'en', weight: 5, topic: 'api-oficial' },
  { term: 'WhatsApp Cloud API', lang: 'en', weight: 5, topic: 'whatsapp-business-api' },
  { term: 'WABA', lang: 'en', weight: 5, topic: 'waba' },
  { term: 'Business Manager', lang: 'en', weight: 3 },
  { term: 'Business Portfolio', lang: 'en', weight: 3, topic: 'waba' },
  { term: 'Business Verification', lang: 'en', weight: 4, topic: 'verificacao-de-empresa' },
  { term: 'Meta Business Verification', lang: 'en', weight: 4, topic: 'verificacao-de-empresa' },
  { term: 'WhatsApp display name', lang: 'en', weight: 4, topic: 'nome-de-exibicao' },
  { term: 'Messaging limit', lang: 'en', weight: 4, topic: 'limites' },
  { term: '250 limit', lang: 'en', weight: 3, topic: 'limites' },
  { term: '2K limit', lang: 'en', weight: 3, topic: 'limites' },
  { term: '10K limit', lang: 'en', weight: 3, topic: 'limites' },
  { term: '100K limit', lang: 'en', weight: 3, topic: 'limites' },
  { term: 'Quality rating', lang: 'en', weight: 4, topic: 'qualidade' },
  { term: 'Portfolio pacing', lang: 'en', weight: 3, topic: 'limites' },
  { term: 'Template pacing', lang: 'en', weight: 3, topic: 'templates' },
  { term: 'Account restricted', lang: 'en', weight: 5, topic: 'bloqueios' },
  { term: 'Account Integrity', lang: 'en', weight: 5, topic: 'bloqueios' },
  { term: 'Automation violation', lang: 'en', weight: 4, topic: 'bloqueios' },
  { term: 'Embedded Signup', lang: 'en', weight: 3, topic: 'whatsapp-business-api' },
  { term: 'Coexistence', lang: 'en', weight: 3, topic: 'whatsapp-business-api' },
  { term: 'BSP', lang: 'en', weight: 3, topic: 'bsp' },
  { term: 'Infobip', lang: 'en', weight: 3, topic: 'infobip' },
  { term: 'Meta verification stuck', lang: 'en', weight: 4, topic: 'verificacao-de-empresa' },
  { term: 'WABA restricted', lang: 'en', weight: 5, topic: 'bloqueios' },
  { term: 'Business Manager farm', lang: 'en', weight: 4, topic: 'farm-de-bm' },
  { term: 'BM farm', lang: 'en', weight: 4, topic: 'farm-de-bm' },
  { term: 'Facebook profile farm', lang: 'en', weight: 4, topic: 'farm-de-bm' },
  { term: 'Aged BM', lang: 'en', weight: 3, topic: 'farm-de-bm' },
  // Português
  { term: 'API Oficial do WhatsApp', lang: 'pt', weight: 5, topic: 'api-oficial' },
  { term: 'Limite de mensagens', lang: 'pt', weight: 4, topic: 'limites' },
  { term: 'Nome de exibição', lang: 'pt', weight: 4, topic: 'nome-de-exibicao' },
  { term: 'Empresa verificada', lang: 'pt', weight: 4, topic: 'verificacao-de-empresa' },
  { term: 'Conta do WhatsApp restrita', lang: 'pt', weight: 5, topic: 'bloqueios' },
  { term: 'Farm de BM', lang: 'pt', weight: 4, topic: 'farm-de-bm' },
  { term: 'Verificação de empresa', lang: 'pt', weight: 4, topic: 'verificacao-de-empresa' },
  // Espanhol
  { term: 'API oficial de WhatsApp', lang: 'es', weight: 4, topic: 'api-oficial' },
  { term: 'cuenta restringida', lang: 'es', weight: 4, topic: 'bloqueios' },
  { term: 'verificación de empresa', lang: 'es', weight: 3, topic: 'verificacao-de-empresa' },
  // BSPs adicionais
  { term: 'Twilio WhatsApp', lang: 'en', weight: 2, topic: 'bsp' },
  { term: 'Gupshup', lang: 'en', weight: 2, topic: 'bsp' },
  { term: '360dialog', lang: 'en', weight: 2, topic: 'bsp' },
  { term: 'WATI', lang: 'en', weight: 2, topic: 'bsp' },
  // Negativas (ruído comum)
  { term: 'crypto giveaway', lang: 'en', weight: 3, negative: true },
  { term: 'buy followers', lang: 'en', weight: 3, negative: true },
  { term: 'DM me for', lang: 'en', weight: 2, negative: true },
];

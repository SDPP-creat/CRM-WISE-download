/** Definição das fontes e seus conectores. O admin pode ativar/pausar/editar. */

export type ConnectorKind = 'reddit' | 'stackexchange' | 'github' | 'rss' | 'hackernews' | 'meta-status';

/**
 * Classe da fonte — usada na verificação e confiabilidade. Um BSP nunca é
 * tratado automaticamente como fonte independente da Meta.
 */
export type SourceClass =
  | 'official' // Meta / WhatsApp oficial
  | 'partner' // BSP / parceiro
  | 'community' // comunidade técnica (SO, GitHub, subreddits técnicos)
  | 'forum' // fórum anônimo
  | 'individual' // relato individual
  | 'promo'; // conteúdo promocional

export interface SourceSeed {
  slug: string;
  name: string;
  connector: ConnectorKind;
  sourceClass: SourceClass;
  enabled: boolean;
  /** Frequência de coleta em minutos. */
  intervalMinutes: number;
  /** Config específica do conector (subreddits, tags, repos, url do feed...). */
  config: Record<string, unknown>;
}

export const SOURCES: SourceSeed[] = [
  {
    slug: 'reddit-core',
    name: 'Reddit — comunidades principais',
    connector: 'reddit',
    sourceClass: 'community',
    enabled: true,
    intervalMinutes: 30,
    config: {
      subreddits: [
        'WhatsappBusinessAPI', 'FacebookAds', 'facebook', 'whatsapp',
        'PPC', 'digital_marketing', 'marketing', 'SaaS',
      ],
      listing: 'new',
      limitPerSub: 25,
    },
  },
  {
    slug: 'stackoverflow',
    name: 'Stack Overflow',
    connector: 'stackexchange',
    sourceClass: 'community',
    enabled: true,
    intervalMinutes: 60,
    config: {
      site: 'stackoverflow',
      tags: ['whatsapp-cloud-api', 'whatsapp-business-api', 'facebook-graph-api', 'whatsapp', 'meta-business-sdk'],
      pageSize: 30,
    },
  },
  {
    slug: 'github-issues',
    name: 'GitHub — Issues & Discussions',
    connector: 'github',
    sourceClass: 'community',
    enabled: true,
    intervalMinutes: 60,
    config: {
      queries: [
        'whatsapp cloud api in:title,body type:issue',
        'whatsapp business api in:title,body type:issue',
      ],
      repos: ['WhatsApp/WhatsApp-Business-API-Setup-Scripts'],
    },
  },
  {
    slug: 'meta-status',
    name: 'Meta / WhatsApp — Status oficial',
    connector: 'meta-status',
    sourceClass: 'official',
    enabled: true,
    intervalMinutes: 15,
    config: {
      // Página pública de status da plataforma de negócios da Meta.
      url: 'https://metastatus.com/whatsapp-business-api',
    },
  },
  {
    slug: 'meta-changelog',
    name: 'WhatsApp Cloud API — Changelog (RSS/HTML)',
    connector: 'rss',
    sourceClass: 'official',
    enabled: false, // depende de um feed válido; habilitar no admin
    intervalMinutes: 15,
    config: {
      // Preencha com um feed RSS/Atom oficial quando disponível.
      feedUrl: '',
      sourceClassOverride: 'official',
    },
  },
  {
    slug: 'hackernews',
    name: 'Hacker News',
    connector: 'hackernews',
    sourceClass: 'community',
    enabled: true,
    intervalMinutes: 180,
    config: {
      query: 'whatsapp business api',
      minPoints: 5,
    },
  },
  {
    slug: 'infobip-blog',
    name: 'Infobip — Blog/atualizações (RSS)',
    connector: 'rss',
    sourceClass: 'partner',
    enabled: false,
    intervalMinutes: 180,
    config: { feedUrl: '', sourceClassOverride: 'partner' },
  },
];

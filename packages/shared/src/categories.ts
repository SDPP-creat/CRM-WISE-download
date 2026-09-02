/** Categorias visíveis. Uma notícia pode ter várias, mas sempre uma principal. */

export interface CategoryDef {
  slug: string;
  label: string; // hashtag exibida
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  { slug: 'api-oficial', label: '#APIOficial', description: 'API Oficial do WhatsApp / WhatsApp Business Platform.' },
  { slug: 'whatsapp-business-api', label: '#WhatsAppBusinessAPI', description: 'Cloud API, on-premise, integrações e SDKs.' },
  { slug: 'farm-de-bm', label: '#FarmDeBM', description: 'Farm de BM/perfis — tratado apenas como inteligência de risco.' },
  { slug: 'verificacao-de-empresa', label: '#VerificaçãoDeEmpresa', description: 'Business Verification / Meta Business Verification.' },
  { slug: 'waba', label: '#WABA', description: 'WhatsApp Business Account e Business Portfolio.' },
  { slug: 'limites', label: '#Limites', description: 'Limites de mensagens: 250, 2K, 10K, 100K, ilimitado.' },
  { slug: 'nome-de-exibicao', label: '#NomeDeExibição', description: 'Aprovação de display name.' },
  { slug: 'templates', label: '#Templates', description: 'Marketing, utilidade e autenticação; template pacing.' },
  { slug: 'qualidade', label: '#Qualidade', description: 'Quality rating dos números e templates.' },
  { slug: 'bloqueios', label: '#Bloqueios', description: 'Bloqueios, restrições e Account Integrity.' },
  { slug: 'bsp', label: '#BSP', description: 'BSPs em geral (Twilio, Gupshup, 360dialog, etc.).' },
  { slug: 'infobip', label: '#Infobip', description: 'Notícias e atualizações específicas da Infobip.' },
  { slug: 'instabilidade', label: '#Instabilidade', description: 'Erros, quedas e instabilidades operacionais.' },
  { slug: 'mudanca-oficial', label: '#MudançaOficial', description: 'Mudanças de políticas, preços e documentação da Meta.' },
  { slug: 'rumor', label: '#Rumor', description: 'Rumor / não confirmado.' },
];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

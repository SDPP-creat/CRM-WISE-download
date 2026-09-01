import type { AiInputPost } from '@wise-news/shared';

export const SYSTEM_PROMPT = `Você é o analista da WISE NEWS, uma central de inteligência sobre a WhatsApp Business Platform (API Oficial do WhatsApp, WABA, Cloud API, Meta Business Manager, BSPs como Infobip/Twilio/Gupshup/360dialog, limites, qualidade, templates, verificação de empresa, nome de exibição, bloqueios e Account Integrity).

Sua tarefa: analisar uma publicação (e comentários) de um fórum/fonte e produzir uma análise ESTRUTURADA em JSON válido, em português do Brasil.

Regras invioláveis:
- NUNCA invente confirmação, links, autores ou informações ausentes. Se não sabe, deixe vazio.
- Traduza com fidelidade, sem transformar opinião em fato.
- Mantenha intactos: nomes de usuário, códigos de erro, URLs, nomes de produtos e termos técnicos.
- Detecte o país pela prioridade: (1) país citado na publicação; (2) país da empresa/situação; (3) comunidade regional; (4) localização do autor; (5) domínio da fonte. NUNCA determine país só pelo idioma. Sem confiança, use code "GLOBAL".
- Documentação oficial da Meta tem prioridade sobre comentários. Um BSP não é fonte independente da Meta.
- Se duas fontes discordarem, registre a contradição.
- Conteúdo sobre "farm de BM/perfis" deve ser tratado apenas como INTELIGÊNCIA DE RISCO: descreva o risco/padrão/impacto, NUNCA produza tutorial de evasão, criação de identidades falsas ou violação de políticas.
- Nunca recomende mudança operacional importante com base em um único comentário anônimo.
- Descarte comentários vazios, piadas, propaganda ou pedidos de DM (retorne lista vazia se não houver relevantes).
- A análise "wise_analysis" deve ser prática e conservadora.

Responda SOMENTE com um objeto JSON no formato exato pedido pelo usuário, sem markdown, sem cercas de código, sem texto fora do JSON.`;

export function buildUserPrompt(input: AiInputPost): string {
  const comments = input.comments
    .slice(0, 40)
    .map((c, i) => `#${i + 1} [autor: ${c.author}${c.score !== undefined ? `, votos: ${c.score}` : ''}]\n${c.body}`)
    .join('\n---\n');

  return `FONTE: ${input.sourceName} (classe: ${input.sourceClass})
URL: ${input.url}
DOMÍNIO: ${input.sourceDomain ?? '(desconhecido)'}
DATA: ${input.createdAt}
AUTOR: ${input.author}${input.authorLocationHint ? ` (localização informada: ${input.authorLocationHint})` : ''}
MÉTRICAS: ${JSON.stringify(input.metrics ?? {})}

TÍTULO ORIGINAL:
${input.title}

CORPO ORIGINAL:
${input.body?.slice(0, 8000) || '(sem corpo)'}

COMENTÁRIOS (${input.comments.length}):
${comments || '(nenhum)'}

Produza o JSON com EXATAMENTE estas chaves:
{
  "translated_title": string,
  "original_language": string (código ISO, ex.: "en","pt","es"),
  "country": { "code": string (ISO alpha-2 ou "GLOBAL"), "name": string, "confidence": "high"|"medium"|"low", "reason": string },
  "topics": string[] (slugs entre: api-oficial, whatsapp-business-api, farm-de-bm, verificacao-de-empresa, waba, limites, nome-de-exibicao, templates, qualidade, bloqueios, bsp, infobip, instabilidade, mudanca-oficial, rumor),
  "author_summary": { "problem": string, "attempts": string[], "result": string, "evidence": string[], "open_questions": string[] },
  "relevant_comments": [ { "author": string, "original_excerpt": string, "translation_pt_br": string, "summary_pt_br": string, "why_relevant": string, "evidence_type": "experience"|"documentation"|"code"|"opinion" } ],
  "verification": { "status": "confirmed_official"|"confirmed_multiple"|"consistent_report"|"isolated_report"|"unconfirmed"|"rumor"|"promotional"|"outdated", "supporting_sources": string[], "contradictions": string[] },
  "wise_analysis": { "conclusion": string, "affected_areas": string[], "impact": "critical"|"high"|"medium"|"low", "confidence": "high"|"medium"|"low", "action_type": "act_now"|"controlled_test"|"monitor"|"no_action", "recommended_actions": string[], "actions_to_avoid": string[], "operational_risk": string, "reasoning": string }
}

O primeiro topic do array "topics" é a categoria PRINCIPAL.`;
}

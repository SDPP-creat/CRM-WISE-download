import { z } from 'zod';
import { extractJson } from './validate.js';

/** Entrada e saída da síntese de resposta combinada (feature Perguntas). */

export interface QaAnswerInput {
  question: string;
  answers: Array<{ forum: string; author: string; excerpt: string; url: string; score?: number }>;
}

export const qaResultSchema = z.object({
  answer_pt_br: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  per_source: z.array(z.object({ forum: z.string(), stance: z.string(), note: z.string() })),
  contradictions: z.array(z.string()),
  caveats: z.array(z.string()),
});
export type QaResult = z.infer<typeof qaResultSchema>;

export const QA_SYSTEM_PROMPT = `Você é o assistente da WISE NEWS, especialista na WhatsApp Business Platform (API Oficial, WABA, Cloud API, Meta Business, BSPs, limites, qualidade, templates, verificação, bloqueios).

Você recebe uma PERGUNTA do usuário e um conjunto de RESPOSTAS/discussões coletadas de vários fóruns públicos (Reddit, Stack Overflow, GitHub, Hacker News, etc.). Sua tarefa: montar UMA resposta combinada em português do Brasil, deixando claro o que cada fórum indicou.

Regras invioláveis:
- Baseie-se SOMENTE no material fornecido. NUNCA invente fatos, links ou fontes.
- Cite explicitamente de qual fórum veio cada informação relevante (campo per_source).
- Se as fontes discordarem, registre a contradição (não esconda).
- Se o material for insuficiente para responder com segurança, diga isso e baixe a confiança.
- Documentação oficial da Meta > relatos de fórum. Um BSP não é fonte independente da Meta.
- Não transforme relato anedótico em fato. Nada de tutorial de evasão de políticas.

Responda SOMENTE com JSON válido, sem markdown, sem cercas de código, sem texto fora do JSON.`;

export function buildQaPrompt(input: QaAnswerInput): string {
  const answers = input.answers
    .slice(0, 40)
    .map((a, i) => `#${i + 1} [fórum: ${a.forum}${a.score !== undefined ? `, votos: ${a.score}` : ''}, autor: ${a.author}]\nURL: ${a.url}\n${a.excerpt.slice(0, 1200)}`)
    .join('\n---\n');

  return `PERGUNTA DO USUÁRIO:
${input.question}

RESPOSTAS COLETADAS DOS FÓRUNS (${input.answers.length}):
${answers || '(nenhuma resposta encontrada ainda)'}

Produza o JSON com EXATAMENTE estas chaves:
{
  "answer_pt_br": string (resposta combinada, objetiva, citando os fóruns quando afirmar algo),
  "confidence": "high" | "medium" | "low",
  "per_source": [ { "forum": string, "stance": string (o que esse fórum indicou), "note": string } ],
  "contradictions": string[] (divergências entre fontes; vazio se não houver),
  "caveats": string[] (ressalvas/limitações; ex.: "baseado em relatos isolados")
}`;
}

export function validateQaResult(raw: unknown): QaResult {
  return qaResultSchema.parse(raw);
}

export { extractJson };

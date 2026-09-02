import { aiAnalysisSchema, normalizeCountryCode, countryName, CATEGORY_SLUGS } from '@wise-news/shared';
import type { AiAnalysis } from '@wise-news/shared';

/** Extrai o primeiro objeto JSON de um texto (tolera cercas de código). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Nenhum objeto JSON encontrado na resposta da IA.');
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Valida + normaliza a análise da IA. Lança ZodError se inválida. */
export function validateAnalysis(raw: unknown): AiAnalysis {
  const parsed = aiAnalysisSchema.parse(raw);
  // Normaliza país
  const code = normalizeCountryCode(parsed.country.code);
  parsed.country.code = code;
  parsed.country.name = parsed.country.name || countryName(code);
  // Mantém apenas topics conhecidos; garante ao menos um.
  const topics = parsed.topics.filter((t) => (CATEGORY_SLUGS as readonly string[]).includes(t));
  parsed.topics = topics.length > 0 ? topics : ['whatsapp-business-api'];
  return parsed;
}

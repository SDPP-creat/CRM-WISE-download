import { z } from 'zod';

/**
 * Formato estruturado que a IA deve produzir e que é validado antes de
 * persistir. Espelha a especificação do produto (seção 18).
 */

export const confidenceEnum = z.enum(['high', 'medium', 'low']);
export const impactEnum = z.enum(['critical', 'high', 'medium', 'low']);
export const actionTypeEnum = z.enum(['act_now', 'controlled_test', 'monitor', 'no_action']);
export const evidenceTypeEnum = z.enum(['experience', 'documentation', 'code', 'opinion']);

export const verificationStatusEnum = z.enum([
  'confirmed_official', // Confirmado oficialmente
  'confirmed_multiple', // Confirmado por várias fontes
  'consistent_report', // Relato consistente
  'isolated_report', // Relato isolado
  'unconfirmed', // Não confirmado
  'rumor', // Rumor
  'promotional', // Conteúdo promocional
  'outdated', // Informação desatualizada
]);
export type VerificationStatus = z.infer<typeof verificationStatusEnum>;

export const countrySchema = z.object({
  code: z.string(), // ISO alpha-2 ou "GLOBAL"
  name: z.string(),
  confidence: confidenceEnum,
  reason: z.string(),
});

export const relevantCommentSchema = z.object({
  author: z.string(),
  original_excerpt: z.string(),
  translation_pt_br: z.string(),
  summary_pt_br: z.string(),
  why_relevant: z.string(),
  evidence_type: evidenceTypeEnum,
});

export const authorSummarySchema = z.object({
  problem: z.string(),
  attempts: z.array(z.string()),
  result: z.string(),
  evidence: z.array(z.string()),
  open_questions: z.array(z.string()),
});

export const verificationSchema = z.object({
  status: verificationStatusEnum,
  supporting_sources: z.array(z.string()),
  contradictions: z.array(z.string()),
});

export const wiseAnalysisSchema = z.object({
  conclusion: z.string(),
  affected_areas: z.array(z.string()),
  impact: impactEnum,
  confidence: confidenceEnum,
  action_type: actionTypeEnum,
  recommended_actions: z.array(z.string()),
  actions_to_avoid: z.array(z.string()),
  operational_risk: z.string(),
  reasoning: z.string(),
});

export const aiAnalysisSchema = z.object({
  translated_title: z.string(),
  original_language: z.string(),
  country: countrySchema,
  topics: z.array(z.string()),
  author_summary: authorSummarySchema,
  relevant_comments: z.array(relevantCommentSchema),
  verification: verificationSchema,
  wise_analysis: wiseAnalysisSchema,
});

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
export type WiseAnalysis = z.infer<typeof wiseAnalysisSchema>;
export type RelevantComment = z.infer<typeof relevantCommentSchema>;
export type CountryInfo = z.infer<typeof countrySchema>;

/** Estrutura de entrada enviada à IA para análise de um post + comentários. */
export interface AiInputPost {
  title: string;
  body: string;
  author: string;
  sourceName: string;
  sourceClass: string;
  url: string;
  createdAt: string;
  metrics?: Record<string, number | undefined>;
  comments: Array<{ author: string; body: string; score?: number; createdAt?: string }>;
  authorLocationHint?: string;
  sourceDomain?: string;
}

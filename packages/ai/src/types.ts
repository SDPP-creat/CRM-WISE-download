import type { AiAnalysis, AiInputPost } from '@wise-news/shared';

export interface AiUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiResult {
  analysis: AiAnalysis;
  usage: AiUsage;
}

/** Contrato de provedor de IA — permite trocar Anthropic por outro. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Retorna JSON estruturado validado + uso. Lança em falha irrecuperável. */
  analyze(input: AiInputPost): Promise<AiResult>;
  /** Testa credenciais/conectividade. */
  ping(): Promise<{ ok: boolean; message: string }>;
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

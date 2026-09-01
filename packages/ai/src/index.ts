import { AnthropicProvider } from './anthropic.js';
import type { AiProvider, ProviderConfig } from './types.js';

export * from './types.js';
export * from './prompt.js';
export * from './validate.js';
export { AnthropicProvider } from './anthropic.js';

/**
 * Fábrica de provedor de IA (camada independente). Hoje só Anthropic; novos
 * provedores entram aqui sem tocar no restante do código.
 */
export function createAiProvider(provider: string, config: ProviderConfig): AiProvider {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    default:
      throw new Error(`Provedor de IA desconhecido: ${provider}`);
  }
}

/** Retorna um provider a partir do ambiente, ou null se não configurado. */
export function providerFromEnv(env: { ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string; AI_MAX_TOKENS?: string }, fetchImpl?: typeof fetch): AiProvider | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new AnthropicProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL,
    maxTokens: env.AI_MAX_TOKENS ? Number(env.AI_MAX_TOKENS) : undefined,
    fetchImpl,
  });
}

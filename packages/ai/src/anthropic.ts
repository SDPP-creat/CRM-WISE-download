import type { AiInputPost } from '@wise-news/shared';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
import type { AiProvider, AiResult, AiUsage, ProviderConfig, QaAiResult } from './types.js';
import { extractJson, validateAnalysis } from './validate.js';
import { buildQaPrompt, QA_SYSTEM_PROMPT, validateQaResult, type QaAnswerInput } from './qa.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

// Preços aproximados por 1M tokens (USD). Ajustável; usado só para estimativa.
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  default: { in: 3, out: 15 },
};

function priceFor(model: string) {
  const key = Object.keys(PRICE_PER_MTOK).find((k) => model.includes(k)) ?? 'default';
  return PRICE_PER_MTOK[key];
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  model: string;
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private apiKey: string;
  private maxTokens: number;
  private fetchImpl: typeof fetch;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) throw new Error('ANTHROPIC_API_KEY ausente.');
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens ?? 4096;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  /** Chamada base à API de mensagens, com retry/backoff. Retorna texto + uso. */
  private async callJson(system: string, user: string): Promise<{ text: string; usage: AiUsage }> {
    const body = { model: this.model, max_tokens: this.maxTokens, system, messages: [{ role: 'user', content: user }] };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.fetchImpl(API_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(body),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`Anthropic HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 2 ** attempt * 800));
          continue;
        }
        if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
        const json = (await res.json()) as AnthropicResponse;
        const text = json.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
        const inputTokens = json.usage?.input_tokens ?? 0;
        const outputTokens = json.usage?.output_tokens ?? 0;
        const price = priceFor(json.model ?? this.model);
        const costUsd = (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
        return { text, usage: { provider: this.name, model: json.model ?? this.model, inputTokens, outputTokens, costUsd } };
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Falha na chamada da IA.');
  }

  async analyze(input: AiInputPost): Promise<AiResult> {
    const { text, usage } = await this.callJson(SYSTEM_PROMPT, buildUserPrompt(input));
    return { analysis: validateAnalysis(extractJson(text)), usage };
  }

  async answerQuestion(input: QaAnswerInput): Promise<QaAiResult> {
    const { text, usage } = await this.callJson(QA_SYSTEM_PROMPT, buildQaPrompt(input));
    return { result: validateQaResult(extractJson(text)), usage };
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.fetchImpl(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
      });
      return { ok: res.ok, message: res.ok ? `OK (${this.model})` : `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}

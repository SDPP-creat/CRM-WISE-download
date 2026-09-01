import type {
  HealthCheckResult,
  NormalizedComment,
  NormalizedPost,
  SourceRuntimeConfig,
} from '@wise-news/shared';

/**
 * Interface comum implementada por todos os conectores de fonte. Permite
 * ativar, pausar, configurar, testar e coletar de forma uniforme.
 */
export interface SourceAdapter {
  readonly kind: string;

  /** Valida a config + segredos necessários. Lança/retorna erro descritivo. */
  validateConfig(source: SourceRuntimeConfig): { ok: boolean; errors: string[] };

  /** Busca os itens mais recentes (usando cursores quando aplicável). */
  fetchLatest(source: SourceRuntimeConfig, ctx: FetchContext): Promise<FetchLatestResult>;

  /** Busca um único post por id externo (para reprocesso/atualização). */
  fetchPost(source: SourceRuntimeConfig, externalId: string, ctx: FetchContext): Promise<NormalizedPost | null>;

  /** Busca comentários de um post. */
  fetchComments(source: SourceRuntimeConfig, externalId: string, ctx: FetchContext): Promise<NormalizedComment[]>;

  /** Converte um payload bruto em NormalizedPost (exposto para testes/fixtures). */
  normalize(raw: unknown, source: SourceRuntimeConfig): NormalizedPost | null;

  /** Teste de saúde do conector (rede + credenciais). */
  healthCheck(source: SourceRuntimeConfig, ctx: FetchContext): Promise<HealthCheckResult>;
}

export interface FetchContext {
  /** fetch injetável para testes; default = globalThis.fetch. */
  fetch: typeof fetch;
  /** Cursores por escopo (subreddit/tag) para paginação incremental. */
  cursors?: Record<string, { cursor?: string; lastSeen?: string }>;
  now?: () => number;
  logger?: (msg: string, extra?: unknown) => void;
}

export interface FetchLatestResult {
  posts: NormalizedPost[];
  /** Novos cursores por escopo, para persistir. */
  cursors: Record<string, { cursor?: string; lastSeen?: string }>;
}

export function defaultContext(partial?: Partial<FetchContext>): FetchContext {
  return {
    fetch: partial?.fetch ?? globalThis.fetch,
    cursors: partial?.cursors ?? {},
    now: partial?.now ?? (() => Date.now()),
    logger: partial?.logger ?? (() => {}),
  };
}

import type { ConnectorKind, SourceClass } from './sources.js';
import type { VerificationStatus } from './ai-schema.js';

export type ProcessingStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'needs_review' | 'rejected';
export type ImpactLevel = 'critical' | 'high' | 'medium' | 'low';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type UserRole = 'admin' | 'editor' | 'reader';

/** Item normalizado que todo adaptador de fonte produz. */
export interface NormalizedPost {
  externalId: string; // id estável na fonte
  sourceSlug: string;
  url: string; // link direto para a publicação original
  canonicalUrl?: string;
  title: string;
  body: string;
  author: string;
  authorId?: string;
  authorLocationHint?: string;
  community?: string; // subreddit, tag, repo...
  flair?: string;
  createdAt: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  lang?: string; // idioma detectado na origem (best-effort)
  metrics: PostMetrics;
  mediaUrls: string[];
  links: string[];
  raw: unknown; // payload bruto para snapshot/reprocesso
}

export interface PostMetrics {
  score?: number; // votos
  upvoteRatio?: number; // taxa de aprovação (0..1)
  comments?: number;
  views?: number;
}

/** Comentário normalizado. */
export interface NormalizedComment {
  externalId: string;
  postExternalId: string;
  parentExternalId?: string;
  author: string;
  body: string;
  score?: number;
  createdAt: string;
  url: string;
  isReply: boolean;
}

/** Resultado de saúde de um conector. */
export interface HealthCheckResult {
  ok: boolean;
  message: string;
  checkedAt: string;
  latencyMs?: number;
}

export interface SourceRuntimeConfig {
  slug: string;
  connector: ConnectorKind;
  sourceClass: SourceClass;
  enabled: boolean;
  intervalMinutes: number;
  config: Record<string, unknown>;
  /** Credenciais/segredos resolvidos do ambiente (nunca vão ao frontend). */
  secrets: Record<string, string | undefined>;
}

/** Row de post como devolvido pela API para o feed. */
export interface FeedPost {
  id: number;
  title: string; // traduzido quando disponível, senão original
  originalTitle: string;
  summary: string;
  categoryPrimary: string;
  categories: string[];
  countryCode: string;
  countryName: string;
  countryConfidence: ConfidenceLevel | null;
  flag: string;
  sourceName: string;
  sourceClass: SourceClass;
  author: string;
  url: string;
  createdAt: string;
  fetchedAt: string;
  verificationStatus: VerificationStatus | null;
  impact: ImpactLevel | null;
  confidence: ConfidenceLevel | null;
  relatedCount: number;
  processingStatus: ProcessingStatus;
  lang: string | null;
}

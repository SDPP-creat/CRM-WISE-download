import { describe, it, expect } from 'vitest';
import { extractJson, validateAnalysis, buildUserPrompt } from '@wise-news/ai';
import type { AiAnalysis } from '@wise-news/shared';

const valid: AiAnalysis = {
  translated_title: 'WABA restrita após aprovação do nome de exibição',
  original_language: 'en',
  country: { code: 'BR', name: 'Brasil', confidence: 'high', reason: 'Mencionado no texto.' },
  topics: ['bloqueios', 'nome-de-exibicao'],
  author_summary: { problem: 'Conta restrita', attempts: ['Contatou suporte'], result: 'Aguardando', evidence: [], open_questions: [] },
  relevant_comments: [],
  verification: { status: 'isolated_report', supporting_sources: [], contradictions: [] },
  wise_analysis: {
    conclusion: 'Risco de restrição pós-aprovação.', affected_areas: ['onboarding'], impact: 'high', confidence: 'medium',
    action_type: 'monitor', recommended_actions: ['Monitorar'], actions_to_avoid: ['Escalar volume'], operational_risk: 'baixo', reasoning: 'Relato isolado.',
  },
};

describe('validação estruturada da IA', () => {
  it('extrai JSON mesmo com cercas de código', () => {
    const text = 'Claro!\n```json\n' + JSON.stringify(valid) + '\n```';
    const obj = extractJson(text);
    expect((obj as AiAnalysis).translated_title).toContain('WABA');
  });
  it('valida um objeto correto', () => {
    expect(() => validateAnalysis(valid)).not.toThrow();
    const parsed = validateAnalysis(valid);
    expect(parsed.topics[0]).toBe('bloqueios');
  });
  it('rejeita impacto inválido', () => {
    const bad = { ...valid, wise_analysis: { ...valid.wise_analysis, impact: 'apocalyptic' } };
    expect(() => validateAnalysis(bad)).toThrow();
  });
  it('normaliza país inválido para GLOBAL e filtra topics desconhecidos', () => {
    const weird = { ...valid, country: { ...valid.country, code: 'ZZ' }, topics: ['inexistente', 'limites'] };
    const parsed = validateAnalysis(weird);
    expect(parsed.country.code).toBe('GLOBAL');
    expect(parsed.topics).toEqual(['limites']);
  });
  it('prompt inclui as regras e o conteúdo', () => {
    const p = buildUserPrompt({ title: 'T', body: 'B', author: 'a', sourceName: 's', sourceClass: 'community', url: 'http://x', createdAt: '2026-01-01', comments: [] });
    expect(p).toContain('translated_title');
    expect(p).toContain('GLOBAL');
  });
});

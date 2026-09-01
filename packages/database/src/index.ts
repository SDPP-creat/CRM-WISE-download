import { CATEGORIES, COUNTRY_NAMES_PT, GLOBAL_CODE, GLOBAL_NAME, KEYWORDS, SOURCES } from '@wise-news/shared';

/** Escapa uma string para uso literal em SQL SQLite. */
function q(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Gera SQL de seed idempotente a partir das constantes compartilhadas:
 * países, tópicos/categorias, palavras-chave e fontes (+ config).
 * O usuário admin é criado à parte pelo script de seed (precisa de hash).
 */
export function seedSql(): string {
  const lines: string[] = ['PRAGMA foreign_keys = ON;', 'BEGIN TRANSACTION;'];

  // Países
  lines.push(`INSERT OR IGNORE INTO countries(code, name) VALUES (${q(GLOBAL_CODE)}, ${q(GLOBAL_NAME)});`);
  for (const [code, name] of Object.entries(COUNTRY_NAMES_PT)) {
    lines.push(`INSERT OR IGNORE INTO countries(code, name) VALUES (${q(code)}, ${q(name)});`);
  }

  // Tópicos / categorias
  for (const c of CATEGORIES) {
    lines.push(
      `INSERT INTO topics(slug, label, description) VALUES (${q(c.slug)}, ${q(c.label)}, ${q(c.description)}) ` +
        `ON CONFLICT(slug) DO UPDATE SET label=excluded.label, description=excluded.description;`,
    );
  }

  // Palavras-chave
  for (const k of KEYWORDS) {
    lines.push(
      `INSERT OR IGNORE INTO keywords(term, lang, weight, topic, negative) VALUES (` +
        `${q(k.term)}, ${q(k.lang)}, ${k.weight}, ${q(k.topic ?? null)}, ${k.negative ? 1 : 0});`,
    );
  }

  // Fontes + configs
  for (const s of SOURCES) {
    lines.push(
      `INSERT INTO sources(slug, name, connector, source_class, enabled, interval_minutes) VALUES (` +
        `${q(s.slug)}, ${q(s.name)}, ${q(s.connector)}, ${q(s.sourceClass)}, ${s.enabled ? 1 : 0}, ${s.intervalMinutes}) ` +
        `ON CONFLICT(slug) DO UPDATE SET name=excluded.name, connector=excluded.connector, source_class=excluded.source_class, interval_minutes=excluded.interval_minutes;`,
    );
    lines.push(
      `INSERT INTO source_configs(source_id, config) ` +
        `SELECT id, ${q(JSON.stringify(s.config))} FROM sources WHERE slug=${q(s.slug)} ` +
        `ON CONFLICT(source_id) DO UPDATE SET config=excluded.config;`,
    );
  }

  // Configurações default do sistema
  const defaults: Record<string, unknown> = {
    collection_enabled: true,
    relevance_threshold: 35,
    ai_monthly_budget_usd: 50,
    comment_revisit_hours: [0.5, 2, 6, 24, 72],
  };
  for (const [key, value] of Object.entries(defaults)) {
    lines.push(
      `INSERT INTO system_settings(key, value) VALUES (${q(key)}, ${q(JSON.stringify(value))}) ` +
        `ON CONFLICT(key) DO NOTHING;`,
    );
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

/** Nomes das migrations, na ordem de aplicação (para wrangler / testes). */
export const MIGRATION_FILES = ['0001_init.sql'];

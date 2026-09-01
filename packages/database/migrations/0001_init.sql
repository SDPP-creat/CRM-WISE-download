-- WISE NEWS — schema inicial (Cloudflare D1 / SQLite).
-- Convenções: timestamps em texto ISO-8601 UTC; booleanos como INTEGER 0/1.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Usuários, sessões, auditoria e configurações
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'reader' CHECK (role IN ('admin','editor','reader')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,             -- token opaco (hash)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,               -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT,                        -- user_id ou 'system'
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT,                        -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- Fontes e coleta
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  connector        TEXT NOT NULL,          -- reddit|stackexchange|github|rss|hackernews|meta-status
  source_class     TEXT NOT NULL DEFAULT 'community',
  enabled          INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_configs (
  source_id  INTEGER PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  config     TEXT NOT NULL DEFAULT '{}',   -- JSON específico do conector
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_cursors (
  source_id  INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL,               -- ex.: subreddit ou tag
  cursor     TEXT,                        -- token/after/paging
  last_seen  TEXT,                        -- id/data do último item
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_id, scope)
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'running', -- running|ok|error
  items_found   INTEGER NOT NULL DEFAULT 0,
  items_new     INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  latency_ms    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_crawl_source ON crawl_runs(source_id, started_at);

-- ---------------------------------------------------------------------------
-- Autores, posts, comentários (com versionamento)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS authors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  external_id    TEXT,
  username       TEXT NOT NULL,
  location_hint  TEXT,
  karma          INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, username)
);

CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,                  -- ISO alpha-2 ou GLOBAL
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id           INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  author_id           INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  external_id         TEXT NOT NULL,
  url                 TEXT NOT NULL,
  canonical_url       TEXT,
  content_hash        TEXT,
  title               TEXT NOT NULL,       -- título original
  body                TEXT NOT NULL DEFAULT '',
  community           TEXT,
  flair               TEXT,
  lang                TEXT,
  country_code        TEXT REFERENCES countries(code),
  country_confidence  TEXT,                -- high|medium|low
  country_reason      TEXT,
  score               INTEGER,
  upvote_ratio        REAL,
  comment_count       INTEGER,
  views               INTEGER,
  media_urls          TEXT,                -- JSON array
  links               TEXT,                -- JSON array
  category_primary    TEXT,
  verification_status TEXT,
  impact              TEXT,                -- critical|high|medium|low
  confidence          TEXT,                -- high|medium|low
  cluster_id          INTEGER REFERENCES duplicate_clusters(id) ON DELETE SET NULL,
  processing_status   TEXT NOT NULL DEFAULT 'pending',
  ai_error            TEXT,
  published           INTEGER NOT NULL DEFAULT 0,
  raw                 TEXT,                -- payload bruto (JSON)
  created_at          TEXT NOT NULL,       -- data de publicação na fonte
  updated_at          TEXT,                -- última atualização na fonte
  fetched_at          TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at        TEXT,
  UNIQUE (source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_posts_created   ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_status    ON posts(processing_status);
CREATE INDEX IF NOT EXISTS idx_posts_country   ON posts(country_code);
CREATE INDEX IF NOT EXISTS idx_posts_category  ON posts(category_primary);
CREATE INDEX IF NOT EXISTS idx_posts_hash      ON posts(content_hash);
CREATE INDEX IF NOT EXISTS idx_posts_canonical ON posts(canonical_url);
CREATE INDEX IF NOT EXISTS idx_posts_cluster   ON posts(cluster_id);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, created_at);

CREATE TABLE IF NOT EXISTS post_versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  title      TEXT,
  body       TEXT,
  score      INTEGER,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_postver_post ON post_versions(post_id);

CREATE TABLE IF NOT EXISTS comments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id             INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id           INTEGER REFERENCES authors(id) ON DELETE SET NULL,
  external_id         TEXT NOT NULL,
  parent_external_id  TEXT,
  body                TEXT NOT NULL,
  score               INTEGER,
  url                 TEXT,
  is_reply            INTEGER NOT NULL DEFAULT 0,
  relevance_score     INTEGER,
  is_relevant         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  fetched_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

CREATE TABLE IF NOT EXISTS comment_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  body        TEXT,
  score       INTEGER,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Tópicos / categorias
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS post_topics (
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, topic_id)
);

CREATE TABLE IF NOT EXISTS keywords (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  term     TEXT NOT NULL,
  lang     TEXT NOT NULL DEFAULT 'en',
  weight   INTEGER NOT NULL DEFAULT 1,
  topic    TEXT,
  negative INTEGER NOT NULL DEFAULT 0,
  UNIQUE (term, lang)
);

-- ---------------------------------------------------------------------------
-- Traduções, resumos, análise Wise, evidências
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS translations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  lang_from    TEXT,
  title_pt     TEXT,
  body_pt      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id)
);

CREATE TABLE IF NOT EXISTS summaries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  short_summary TEXT,                     -- resumo curto p/ card
  problem      TEXT,
  attempts     TEXT,                      -- JSON array
  result       TEXT,
  evidence     TEXT,                      -- JSON array
  open_questions TEXT,                    -- JSON array
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id)
);

CREATE TABLE IF NOT EXISTS participant_summaries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id        INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  comment_id     INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  author         TEXT NOT NULL,
  role           TEXT NOT NULL,           -- author|commenter|reply
  original_excerpt TEXT,
  translation_pt TEXT,
  summary_pt     TEXT,
  why_relevant   TEXT,
  evidence_type  TEXT,                    -- experience|documentation|code|opinion
  score          INTEGER,
  comment_url    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_partsum_post ON participant_summaries(post_id);

CREATE TABLE IF NOT EXISTS wise_analyses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id          INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  conclusion       TEXT,
  affected_areas   TEXT,                  -- JSON array
  impact           TEXT,
  confidence       TEXT,
  action_type      TEXT,                  -- act_now|controlled_test|monitor|no_action
  recommended_actions TEXT,              -- JSON array
  actions_to_avoid TEXT,                 -- JSON array
  operational_risk TEXT,
  reasoning        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id)
);

CREATE TABLE IF NOT EXISTS evidence_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  label       TEXT,
  source_class TEXT,
  kind        TEXT,                       -- supporting|contradiction|related
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_post ON evidence_links(post_id);

-- ---------------------------------------------------------------------------
-- Deduplicação / clusters (dossiês)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS duplicate_clusters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  event_key   TEXT,
  report_count INTEGER NOT NULL DEFAULT 1,
  countries   TEXT,                       -- JSON array de códigos
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Usuário final: bookmarks, alertas, notificações, push
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookmarks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id   INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,               -- official_change|blocking_wave|limits|verification|instability|country|category|impact
  filter     TEXT,                        -- JSON (país, categoria, impacto mínimo...)
  active      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  post_id    INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  kind       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  dedupe_key TEXT,                        -- evita notificações repetidas
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedupe ON notifications(user_id, dedupe_key);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- IA e jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aiusage_created ON ai_usage(created_at);

CREATE TABLE IF NOT EXISTS failed_jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type    TEXT NOT NULL,
  payload     TEXT NOT NULL,              -- JSON
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_tried_at TEXT
);

-- ---------------------------------------------------------------------------
-- Busca textual (FTS5) sobre posts (título + corpo + tradução + resumo)
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  title, body, title_pt, summary,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);

-- WISE NEWS — feature Perguntas (Q&A agregado dos fóruns indexados).

CREATE TABLE IF NOT EXISTS questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text          TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'open',   -- open|answered|closed
  ai_answer     TEXT,                              -- resposta combinada (pt-BR)
  ai_confidence TEXT,                              -- high|medium|low
  ai_per_source TEXT,                              -- JSON [{forum,stance,note}]
  ai_contradictions TEXT,                          -- JSON string[]
  ai_caveats    TEXT,                              -- JSON string[]
  ai_status     TEXT NOT NULL DEFAULT 'pending',   -- pending|processing|done|failed
  ai_error      TEXT,
  answers_count INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);

CREATE TABLE IF NOT EXISTS question_answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  source_slug  TEXT,
  forum        TEXT NOT NULL,                      -- nome exibido do fórum
  source_class TEXT,                               -- official|partner|community|...
  post_id      INTEGER REFERENCES posts(id) ON DELETE SET NULL, -- se veio do índice
  author       TEXT,
  title        TEXT,
  excerpt      TEXT NOT NULL,
  url          TEXT NOT NULL,
  score        INTEGER,
  relevance    INTEGER,
  lang         TEXT,
  created_at   TEXT,                               -- data na origem
  fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (question_id, url)
);
CREATE INDEX IF NOT EXISTS idx_qanswers_q ON question_answers(question_id, relevance);

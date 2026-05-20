CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  auto_run INTEGER NOT NULL DEFAULT 0,
  provider_override TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_owner_email ON questions(owner_email);

CREATE TABLE IF NOT EXISTS llm_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_llm_settings_owner_email ON llm_settings(owner_email);

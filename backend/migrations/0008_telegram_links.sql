CREATE TABLE IF NOT EXISTS telegram_links (
  tg_user_id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  tg_username TEXT,
  tg_first_name TEXT,
  linked_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_telegram_links_email ON telegram_links(email);

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY,
  tg_user_id INTEGER NOT NULL,
  tg_username TEXT,
  tg_first_name TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires ON telegram_link_tokens(expires_at);

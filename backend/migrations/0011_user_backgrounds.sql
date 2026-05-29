CREATE TABLE IF NOT EXISTS user_backgrounds (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL COLLATE NOCASE,
  label TEXT NOT NULL,
  mime TEXT NOT NULL,
  ext TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_backgrounds_owner ON user_backgrounds(owner_email);

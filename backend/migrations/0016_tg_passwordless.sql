-- Per-user passwordless login toggle
CREATE TABLE IF NOT EXISTS user_passwordless_settings (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  tg_status TEXT NOT NULL DEFAULT 'off', -- 'off' | 'active'
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES users(email)
);

-- Number-match challenges (login + activation test)
CREATE TABLE IF NOT EXISTS tg_passwordless_challenges (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE,
  email_hash TEXT NOT NULL,
  tg_user_id INTEGER NOT NULL,
  display_number INTEGER NOT NULL,
  button_numbers_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_at INTEGER,
  denied_at INTEGER,
  consumed_at INTEGER,
  send_count INTEGER NOT NULL DEFAULT 0,
  is_enrollment INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_tg_pwdless_chal_email ON tg_passwordless_challenges(email);
CREATE INDEX IF NOT EXISTS idx_tg_pwdless_chal_expires ON tg_passwordless_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_tg_pwdless_chal_hash ON tg_passwordless_challenges(token_hash);

-- Rate limiting: bucket = 'user:{email_hash}' or 'ip:{ip_hash}:{email_hash}'
-- window_key = '10m:{bucket}' or 'day:{bucket}'
CREATE TABLE IF NOT EXISTS tg_passwordless_rate (
  bucket TEXT NOT NULL,
  window_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_key)
);

-- Pending enrollments — activation test flow (endpoints in B3b)
CREATE TABLE IF NOT EXISTS tg_passwordless_enrollments (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  challenge_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES users(email)
);

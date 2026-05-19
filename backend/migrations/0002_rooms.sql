CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (owner_email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_email);
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at);

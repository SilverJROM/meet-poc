CREATE TABLE IF NOT EXISTS meeting_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  host_email TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  ended_reason TEXT,
  admitted_peak INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_room ON meeting_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON meeting_sessions(ended_at);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON meeting_sessions(started_at);

CREATE TABLE IF NOT EXISTS meeting_session_diagnostics (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  relay_used INTEGER NOT NULL DEFAULT 0,
  candidate_types TEXT,
  peer_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meeting_session_diagnostics_owner_created
  ON meeting_session_diagnostics(owner_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meeting_session_diagnostics_session_created
  ON meeting_session_diagnostics(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meeting_session_diagnostics_room_created
  ON meeting_session_diagnostics(room_id, created_at DESC);

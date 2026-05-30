ALTER TABLE meeting_session_diagnostics ADD COLUMN participant_id TEXT;
ALTER TABLE meeting_session_diagnostics ADD COLUMN participant_name TEXT;
ALTER TABLE meeting_session_diagnostics ADD COLUMN participant_client_key TEXT;

CREATE INDEX IF NOT EXISTS idx_meeting_session_diagnostics_session_participant
  ON meeting_session_diagnostics(session_id, participant_id);

# Batch B1a — Scenarios

## S1: Per-person transcript has zero phantom `?` (R1.1, R1.2)

**Setup**: Re-transcribe an existing per-person AGENTROOM recording (`*_AGENTROOM_alice_*.webm` with `.participant.json`).

**Expected**:
- Every `lines[].name` and `words[].name` equals the file owner's `displayName` from `.participant.json`.
- No line or word is labeled `?`.
- `speaker_for_ms` segment lookup is not used.

**Outcome assertion**: transcript JSON speaker set is exactly `{owner displayName}` — NOT just that transcription ran.

---

## S2: Mixed webm is never transcribed (R1.3)

**Setup**: Session has mixed `*_AGENTROOM_dc411e.webm` (no `.participant.json`) plus per-person files.

**Expected**:
- `transcribeSessionRecordings` queues only per-user files.
- `POST /api/recordings/:filename/transcribe` on mixed returns 400.
- `transcribe.py` on mixed prints `skipped: not a per-user recording` and exits 0 without writing a new transcript.
- Mixed file remains listed and downloadable.

**Outcome assertion**: mixed file has no new `.transcript.json` from auto/manual transcribe; per-user files are queued.

---

## S3: Canonical meeting transcript = named-transcript merge (R1.4)

**Setup**: Two per-user recordings in the same session, each with owner-labeled `.transcript.json` sidecars.

**Expected**:
- `GET /api/recordings/named-transcript/:sessionId` returns lines sorted by `startMs`, each labeled by file owner.
- No `?` speakers in merged output.
- Transcripts page "Meeting transcript" button loads this endpoint.

**Outcome assertion**: merged `transcript[].name` values are only real participant names, time-ordered.
# Batch B1a — Changes

## User Report (verbatim)

> "the transcription on my recent call with peer2 the transcript are a bit trash, and it seems like its detecting another party and being marked as ? on the transcript"

On JROM's real 2-person call (host + Peer2), the transcript showed **silverjrom / peer2 / `?`** — a phantom 3rd speaker.

---

## Root Cause Mechanism

`backend/scripts/transcribe.py::speaker_for_ms()` re-attributed **every transcribed word** to a speaker by testing which active-speaker **segment window** the word's timestamp falls into. Words landing in segment gaps (silence, overlap, or Whisper hallucinations during quiet audio) received `name: "?"`. On the mixed webm (`AGENTROOM_dc411e`), this produced a phantom 3rd party alongside real participants.

A clean per-person path already existed (`*.participant.json` + `named-transcript/:sessionId`) but was not enforced: mixed files were still transcribed with segment diarization.

---

## Code Changes

### `backend/scripts/transcribe.py`

**R1.1/R1.2 — Owner-only labeling; retire segment diarization.**

- Added `read_participant_owner()` reading `{audio}.participant.json`.
- Added `label_words_with_owner()` stamping every word with owner `clientId`/`displayName`.
- Removed `speaker_for_ms()` and `participant_names()` entirely.
- Non-per-user files exit early (`skipped: not a per-user recording`) — no transcript written.

WHY: Per-person transcript speaker = file owner, period. `?` becomes structurally impossible.

### `backend/src/modules/recording/index.ts`

**R1.3 — Only per-user files enqueued.**

- Added `isPerUserRecording(filename)` helper.
- `enqueueTranscription()` skips mixed/non-per-user files with log line.
- `transcribeSessionRecordings()` counts/queues only per-user entries.
- `POST /api/recordings/:filename/transcribe` returns 400 for mixed files.

WHY: Mixed webm stays downloadable; never enters the transcription queue.

### `frontend/src/app/services/recordings.service.ts`

**R1.4 — Client access to canonical merge.**

- Added `NamedTranscript` / `NamedTranscriptLine` types.
- Added `getNamedTranscript(sessionId)` calling `GET /api/recordings/named-transcript/:sessionId`.

### `frontend/src/app/pages/transcripts/transcripts.page.{ts,html}`

**R1.4 — Meeting transcript surface.**

- Added "Meeting transcript" primary action (loads `named-transcript` merge).
- Per-file view demoted to "Track" secondary action.
- Viewer renders merged `[mm:ss] Name:` lines from `named-transcript`.

### `backend/scripts/test_owner_labeling.py` (new)

Unit tests for `label_words_with_owner` + `build_lines` — asserts zero `?` names.

### `backend/tests/recording.test.ts`

- B1a: mixed transcribe → 400.
- B1a: session queue counts only per-user files.
- B1a: named-transcript merge sorted, zero `?`.
- FIX-B4 manual transcribe test updated with `.participant.json` sidecar.
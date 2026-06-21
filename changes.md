# Transcription decoupled from the live call (2026-06-21)

## Problem
Transcription (faster-whisper) was triggered on **every recording upload** (`scheduleTranscription`
on `POST /upload`). With per-user recording, a participant's `.webm` uploads when they leave —
which can be **mid-call** while others keep talking. So whisper (the `medium` model) spun up on
the signaling box *during a live call*, contending for CPU with the call it was recording. The
auto-LLM-analysis chained off transcription, compounding it. Bad design: transcription is
post-call work, not inline.

## Fix — transcription is now POST-call only, host-configurable, provider-pluggable

### backend/src/modules/recording/index.ts
- **Removed** the per-upload trigger. `POST /upload` now only saves the file.
- **Serialized queue** (`enqueueTranscription` / `pumpTranscribeQueue`): at most ONE transcription
  runs at a time, so a multi-party session ending (N per-user recordings) never spikes CPU.
- **Post-call auto** (`maybeAutoTranscribeSession`): called from the signaling layer when a session
  closes. No-op unless the room owner's mode is `auto`.
- **On-demand**: existing `POST /api/recordings/:filename/transcribe` (per file) now enqueues;
  new `POST /api/recordings/session/:sessionId/transcribe` transcribes a whole session on demand.
- **Provider seam** (`transcribeViaThirdParty`): `local` on-box whisper (default) or `thirdparty`
  external STT via `MEET_STT_ENDPOINT` / `MEET_STT_API_KEY` / `MEET_STT_MODEL`. Selecting
  `thirdparty` without config is a logged no-op (never errors the call path).
- `spawnTranscription` now signals completion (settled-guarded `onDone`) so the queue advances.

### backend/src/modules/questions/store.ts
- New per-owner settings in the existing `llm_settings` KV table (no migration):
  `transcription_mode` (`auto` | `ondemand` | `off`, default **auto**) and
  `transcription_provider` (`local` | `thirdparty`, default `local`).

### backend/src/modules/signaling/index.ts
- `closeSessionAndAutoTranscribe` wraps the 3 session-close sites (`maybeCloseEmptyRoom`,
  `closeRoomForHost`, `meeting-ended-by-host`) → fires auto-transcription **after** the call ends.

### backend/src/modules/questions/index.ts
- `GET/PUT /api/llm/settings` now read/write `transcriptionMode` + `transcriptionProvider`.

### frontend (questions.service.ts, settings → Transcribe tab)
- `LlmSettings` extended; `updateSettings` accepts the new fields; `transcribeSession()` added.
- Settings → Transcribe tab: "When to transcribe" (Auto after call / On demand / Off) and
  "Provider" (On-box Whisper / External STT) selectors.

## What did NOT change
- Per-user recording + the named cross-talk transcription pipeline (R8/R9) — only *when* it runs.
- The call/media path (audio/video/screenshare/signaling-media) — untouched. Safe for live calls.
- The `/api/recordings/:filename/download` per-person download endpoint.

## Deploy
- Backend: `tsx watch` auto-reloaded (typecheck clean; new session-transcribe route returns 401 =
  registered + auth-gated).
- Frontend: `npm run build` → bundle `main-MXQKFKT3.js`, served on localhost:4700 and
  voice.silverjrom.app.

## Default behavior now
Out of the box: a call records per-person, then — once the call ends — transcribes automatically
(mode `auto`), serialized, on-box. A host can switch to `ondemand` or `off`, or point at an
external STT provider. Whisper never runs while the call is live.

---

See `plan/CFBASE/README.md` for the separate Cloudflare-first redesign spec (where transcription
is off by default and whisper is a Queue→Worker provider).

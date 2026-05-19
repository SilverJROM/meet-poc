# Batch FIX-B4 Changes

## Source
JROM verbatim from brief: "on this i want you to create a new session with codex (-s danger-full-access) to do the grunt work (coding) and you validate/orchestrate and close the session once all are done"

JROM clarification during implementation: the existing "JROM Test" recording has no usable audio content, so the smoke and E2E tests must use a generated synthetic audio fixture with a hand-crafted FIX-B2 sidecar.

## Scope
- branch: `fix/meet-fixb4-transcripts`
- Added local faster-whisper transcription through `backend/.venv-transcribe` with `medium`, CPU, `int8`.
- Added a Python worker that transcribes WebM audio and joins Whisper word timestamps to FIX-B2 sidecar speaker segments.
- Added backend auto/manual transcription trigger, transcript status enrichment, transcript read endpoint, and sidecar cleanup.
- Replaced `/app/transcripts` stub with a real transcript list and viewer.
- Added backend and Playwright coverage plus committed synthetic audio fixture.

## Files Changed
- `.gitignore`
- `backend/scripts/transcribe.py`
- `backend/src/modules/recording/index.ts`
- `backend/tests/recording.test.ts`
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/pages/transcripts/transcripts.page.ts`
- `frontend/src/app/pages/transcripts/transcripts.page.html`
- `frontend/src/app/pages/transcripts/transcripts.page.scss`
- `frontend/src/app/pages/transcripts-stub/transcripts-stub.page.ts`
- `frontend/src/app/services/recordings.service.ts`
- `e2e/fixtures/audio/synth-taglish.webm`
- `e2e/fixtures/audio/synth-taglish.meta.json`
- `e2e/tests/v2-b3-shell/stubs.spec.ts`
- `e2e/tests/v3-fixb4-transcripts/transcripts.spec.ts`

## What Changed
- Worker writes `<audio>.transcript.json` with `schemaVersion`, language, lines, words, model, and confidence fields.
- Backend exposes `GET /api/recordings/:filename/transcript` and `POST /api/recordings/:filename/transcribe`.
- `GET /api/recordings` now includes `durationMs`, `hasTranscript`, and `transcribeStatus`.
- Upload success schedules a non-blocking local transcription job; manual POST can force re-run.
- Delete and bulk-delete remove `.meta.json`, `.transcript.json`, and `.transcribe.lock`.
- `/app/transcripts` lists all recordings, shows Ready/Pending/Failed badges, offers View or Transcribe, auto-polls pending rows, and renders speaker-attributed lines.

## Self-Verification
- `backend/.venv-transcribe/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8'); print('medium loaded')"`: PASS.
- `npm run build -w backend`: PASS.
- `npm run build -w frontend`: PASS.
- `npm test -w backend`: PASS, 59/59.
- `npm test -w e2e -- tests/v3-fixb4-transcripts --config=playwright.live.config.ts --workers=1`: PASS, 1/1.
- Run 1 regression command including FIX-B4, FIX-B2, v2 shell/tabs/lobby/grid/controls/sidebar: PASS, 45/45 after reseeding missing `TEST_ROOM01`.
- Live synthetic smoke via `POST /api/recordings/:filename/transcribe`: PASS, transcript ready with `language=en`, 3 lines, 30 words.

## Reproduction Notes
- Synthetic fixture committed at `e2e/fixtures/audio/synth-taglish.webm` and `e2e/fixtures/audio/synth-taglish.meta.json`.
- Screenshot evidence: `screenshots/transcripts-page.png`.

## Caveats
- gTTS was installed into the venv during exploration, but the committed fixture uses FFmpeg's local `flite` TTS filter because it avoids a network TTS dependency.
- Taglish accuracy is intentionally deferred to real-audio validation; this batch proves local transcription and speaker attribution against known inputs.

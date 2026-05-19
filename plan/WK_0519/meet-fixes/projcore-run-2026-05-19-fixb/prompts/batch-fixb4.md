# FIX-B4 — Local Whisper transcription with speaker attribution (Tagalog + English)

**Persona:** Run as the codex builder. You have `-s danger-full-access` and full machine access.

**COMMIT BEFORE STATUS: DONE.** Past sessions broke this rule on M-B6, FIX-B3, FIX-B2 — please don't make it four.

## Source

JROM verbatim: *"on this i want you to create a new session with codex (-s danger-full-access) to do the grunt work (coding) and you validate/orchestrate and close the session once all are done"*. The agreed approach is Phase 1: faster-whisper `medium` multilingual model (auto-detect Taglish), joined to the FIX-B2 sidecar metadata for per-word speaker attribution.

## Machine state (already confirmed)

- 16-core CPU, 61 GB RAM (42 GB free) — no NVIDIA GPU
- Python 3.12.3, FFmpeg 6.1.1, Docker, Ollama present
- No Whisper currently installed anywhere
- FIX-B2 already produces `<recording>.webm.meta.json` next to each recording with `{schemaVersion:1, sessionId, roomId, recordingStartedAtIso, recordingDurationMs, participants:[{clientId,displayName,isHost,joinedAtMs,leftAtMs}], segments:[{startMs,endMs,clientId,source:"active-speaker-rms"}]}`

## What to ship

### (1) Python install + model download

- Create a Python venv at `backend/.venv-transcribe` (so it doesn't pollute system pip).
- `pip install faster-whisper` (CTranslate2 backend, CPU build).
- Cache the **`medium`** multilingual model on first use to `~/.cache/huggingface/hub/` (default; `faster-whisper` does this). Size ~1.5 GB. Do the initial download as part of the batch — verify it loads.
- Optional fallback: if the small model loads but medium fails (disk full / network), prefer medium.

### (2) Python worker `backend/scripts/transcribe.py`

CLI: `python transcribe.py <audio-file-path>` where the audio file is something like `recordings/<stamp>_<sessionId>_<roomId>_<slug>_<rand>.webm`.

Logic:
1. Read `<audio-file>.meta.json` next to the audio. If missing, log warning + proceed without speaker attribution.
2. Load WhisperModel:
   ```python
   model = WhisperModel("medium", device="cpu", compute_type="int8")
   ```
   `int8` for speed; `medium` for Taglish accuracy.
3. Transcribe:
   ```python
   segments, info = model.transcribe(
       audio_file,
       language=None,                    # auto-detect (Taglish: returns "tl" or "en")
       task="transcribe",
       word_timestamps=True,
       vad_filter=True,                  # skip silence (faster + cleaner)
       initial_prompt="Tagalog and English conversation between meeting participants."
   )
   ```
4. For each word emitted by Whisper, find the FIX-B2 segment whose `startMs <= word.start*1000 <= endMs` and pull its `clientId` + look up `displayName` from `participants[]`. If no segment overlaps (e.g., silence), `clientId=null`, `name="?"`.
5. Group words into "lines" — collapse consecutive words by the same speaker into one line entry, with `startMs`, `endMs`, `clientId`, `name`, `text` (joined word texts), `confidence` (avg).
6. Write `<audio-file>.transcript.json`:
   ```json
   {
     "schemaVersion": 1,
     "transcribedAtIso": "ISO8601",
     "audioFile": "<basename>",
     "language": "tl",                  // from info.language
     "languageProbability": 0.93,
     "model": "medium",
     "lines": [
       { "startMs": 0, "endMs": 1240, "clientId": "abc", "name": "John", "text": "kumusta po", "confidence": 0.92 },
       ...
     ],
     "words": [
       { "startMs": 0, "endMs": 320, "text": "kumusta", "clientId": "abc", "name": "John", "confidence": 0.94 },
       ...
     ]
   }
   ```
7. Exit 0 on success, non-zero on failure. Print one-line status to stdout.

Make it idempotent: if `<audio-file>.transcript.json` exists and `--force` not passed, exit 0 with `"already transcribed"`.

### (3) Backend integration `backend/src/modules/recording/`

- **Auto-transcribe on upload success.** After `fs.writeFile` for the recording lands (in the existing `/upload` route), `child_process.spawn` the Python worker non-blocking. Log start/finish. Don't await — recording UI continues.
- **Status tracking.** Use the existence + content of `<file>.transcript.json` to derive `transcribeStatus`:
  - File exists + valid JSON → `"ready"`
  - File missing but `<file>.transcribe.lock` exists (touch on spawn, unlink on finish/fail) → `"pending"`
  - No transcript file + no lock + recording older than 30 min → `"failed"`
  - Otherwise (recording too new, worker maybe not started yet) → `"pending"`
- **`GET /api/recordings`** enrichment: include `hasTranscript: boolean` and `transcribeStatus: "ready"|"pending"|"failed"|null` per row.
- **`GET /api/recordings/:filename/transcript`** — returns the transcript JSON. 404 if file missing. Auth required, ownership-gated like the rest.
- **`POST /api/recordings/:filename/transcribe`** — manually trigger (re)transcription. Body: `{ force?: boolean }`. Spawns worker. Returns `{ ok: true, status: "started" }`.
- **Bulk-delete (existing) + DELETE single (existing)** must also remove the `<file>.transcript.json` and `<file>.transcribe.lock` if present. Extend the unlink logic.

### (4) Frontend `/app/transcripts` — make it real (currently a stub)

Delete the `transcripts-stub` page entirely, create a real `transcripts/transcripts.page.{ts,html,scss}`. Update route in `app.routes.ts`.

The page:
- Lists recordings from `GET /api/recordings` where `hasTranscript: true`. (Recordings without transcripts can still be visible with a "Transcribe" button when `transcribeStatus !== "ready"`.)
- Per row: recording filename + duration + speaker count + a "View" button.
- Clicking "View" opens a panel below (or modal) showing the transcript lines as a stream:
  ```
  [00:00] John: kumusta po
  [00:05] Mary: ok lang
  ```
- Light styling: speaker name in bold (avatar color from name hash like the rest), timestamp dim, text dark on white.
- Page reuses the rooms-page bulk-delete UI pattern? No — transcripts aren't deletable separately from their recording. Keep it simple: just list + view.
- If `transcribeStatus === "pending"`, show a spinner badge "Transcribing…" + auto-poll every 5s.

### (5) Tests

- Backend integration tests in `backend/tests/recording.test.ts`:
  - GET `/api/recordings/:filename/transcript` returns the file when present
  - POST `/transcribe` spawns the worker (mock with a fake script that touches a transcript file; assert response)
  - Bulk-delete removes the `.transcript.json` sidecar too
- E2E spec `e2e/tests/v3-fixb4-transcripts/transcripts.spec.ts`:
  - Seed a recording + a fake transcript JSON next to it via direct fs write OR direct API
  - Visit `/app/transcripts` → assert the recording appears with `View` button
  - Click View → assert the speaker-attributed lines render
  - Add at least 1 test that confirms `hasTranscript: false` recordings show "Transcribe" instead of "View"

Use the existing `fixtures/rooms.ts` `createRoomViaApi` so the global-teardown auto-cleans the test rooms.

### (6) Build + deploy

- `npm run build -w backend` PASS
- `npm run build -w frontend` PASS
- `pm2 restart meet-poc-be meet-poc-fe`
- Live URL `https://voice.silverjrom.app/app/transcripts` should render (empty list at first if no recordings have been transcribed yet)

### (7) Validation by codex

Before STATUS: DONE, run this end-to-end smoke yourself:
1. Take JROM's existing `JROM Test` recording (`recordings/<file>.webm`) — it should have a sidecar already.
2. `POST /api/recordings/<filename>/transcribe` to backfill.
3. Wait for `transcribeStatus: "ready"` (or watch for `<file>.transcript.json` to appear).
4. Read the transcript JSON — should have `language: "en"` or `"tl"`, lines[], words[].
5. Visit the transcripts page → assert the row + View opens with the lines.
6. Screenshot to `batch-fixb4/screenshots/transcripts-page.png`.

Run 1 desktop regression must still PASS. Backend full suite PASS.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb4/`

1. `changes.md` (verbatim user report + scope + file inventory)
2. `scenarios-implemented.md`
3. `test-report.md` (backend + e2e + Run 1 regression + transcribe smoke output sample)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/transcripts-page.png` (real recording with transcribed lines)
7. **Decisions:** `decisions/2026-05-19-fixb4-whisper.md` (venv vs system pip, medium vs small, int8 vs fp16, auto-detect vs `tl`, auto-trigger vs queue)

## Scope (hard limits)

- **DO** items 1-7.
- **DO NOT** add diarization (pyannote.audio) — that's Phase 2, deferred.
- **DO NOT** add Whisper API integration (cloud) — local only this batch.
- **DO NOT** retrofit transcripts to old recordings automatically — backfill only on explicit POST.

## Completion

**COMMIT BEFORE STATUS: DONE.** Commits per the FIX-B1 pattern (one feat: backend, one feat: frontend, one feat: worker, one test, one docs). Tree clean. Then your `STATUS: DONE — FIX-B4 ...` line.

I will validate via Playwright screenshot + curl smoke + read the actual transcript JSON. After PASS I close this codex session.

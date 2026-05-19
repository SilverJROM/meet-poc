# Batch B5 — Recording (client-side mix + local upload)

**Persona switch:** Invoke `$lead`. You are NOT `$projcore`. Claude `/projcore` supervises.

**Batch ID:** B5
**Plan:** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/implementation-plan.md`
**Branch:** `feat/meet-rebuild-b5-recording` — off the B4 HEAD.

**Requirements assigned (verbatim):**
- **R6.1** — Recording mixes local mic + every admitted peer's audio into one stream
- **R6.2** — `MediaRecorder` produces `.webm`; Record again stops and uploads
- **R6.3** — `POST /upload` writes `recordings/<timestamp>_<roomSlug>_<rand>.webm`
- **R6.4** — Recording indicator visible during; recordings list section on dashboard

Read before coding:
- `og-requirements.md` § R6
- `scenarios.md` S5.1-S5.3
- `project_specs.md` § 5 module boundaries, § 7 testing, § 9 known gotchas
- `context-handoff.md` (post-B4)
- **Legacy reference (port the mix pattern):** `legacy-poc/public/client.js` — search for `MediaRecorder`, `AudioContext`, `createMediaStreamDestination`, `createMediaStreamSource`. The legacy mixes local mic + every admitted peer's `MediaStream` audio track into a single output via AudioContext.
- **Legacy backend reference:** `legacy-poc/server.js:186-207` — `/upload` handler: binary body, `X-Ext` + `X-Room` headers, room-slug derived from room title via regex sanitization.

---

## Context (compressed)

B4 left a Record button in `frontend/src/app/components/controls-bar/` disabled with `title="Recording lands in B5"`. **Enable it.** The button toggles recording on/off. When active, recording indicator visible. On stop, upload the resulting `.webm` and reset.

Dashboard has a `Recordings` placeholder section from B3. **Fill it** with the recording list (filename + size + download link). Filesystem-backed via the new `GET /api/recordings` route.

---

## Expected (acceptance criteria)

### Backend (`backend/src/modules/recording/`)

1. **`index.ts`** — Express router with:
   - `POST /upload` — binary body, headers `X-Ext` (default `webm`, regex-sanitized to `/[a-z0-9]/`), `X-Room` (regex-sanitized to `/[a-z0-9_-]/`, 32 chars max). Writes to `recordings/<ISO-timestamp>_<roomSlug>_<random6hex>.webm`. roomSlug derived from `rooms.title` via `getRoom(roomId, db)` lookup + regex sanitization (matches legacy server.js:189-193). Returns `{ok:true, file: filename, bytes}`.
   - `GET /api/recordings` — auth required (`requireAuth`). Lists files in `recordings/` filtered to those whose embedded roomId belongs to a room owned by the authenticated user. Returns `{recordings: [{filename, sizeBytes, roomId, roomTitle, uploadedAtIso}]}`. Sort newest-first.
   - `GET /api/recordings/:filename/download` — auth required + ownership check (filename must reference a room the user owns). Streams the file with `Content-Type: video/webm` + `Content-Disposition: attachment; filename=...`.

2. **No new SQLite table** unless codex argues filesystem-only listing is insufficient (log the call in decisions/). Filesystem-only is the recommended path — matches legacy + simpler.

3. **Mount in `server.ts`** — `app.use('/', recordingRouter(db))` (so `/upload` is at root, `/api/recordings*` under `/api` — split the router or use two routers).

4. **`recordings/` dir** — create at startup if missing (`fs.mkdirSync({recursive:true})`).

### Frontend

1. **`frontend/src/app/services/recorder.service.ts`** —
   - `start(localStream: MediaStream, peerStreams: Map<clientId, MediaStream>): void`
     - Creates `AudioContext`, `dest = ctx.createMediaStreamDestination()`
     - For each input stream's audio track, `ctx.createMediaStreamSource(stream).connect(dest)`
     - Stores `sourceFor: Map<clientId, MediaStreamAudioSourceNode>` for late peer joins
     - Starts `MediaRecorder(dest.stream, {mimeType: 'audio/webm;codecs=opus'})`
     - Collects chunks in `dataavailable` handler
   - `addPeerStream(clientId, stream)` — for peers admitted during recording
   - `removePeerStream(clientId)` — for peers leaving during recording
   - `stop(): Promise<Blob>` — stops recorder, returns concatenated Blob
   - `upload(blob: Blob, roomId: string): Promise<void>` — fetch POST to `/upload` with binary body + `X-Ext: webm` + `X-Room: <roomId>` headers
   - `isRecording = signal<boolean>(false)`

2. **`controls-bar` component** — wire the Record button:
   - Click: if not recording → call `recorder.start(...)`, set indicator visible
   - Click: if recording → call `recorder.stop()` → `recorder.upload(...)`, hide indicator
   - Button label flips Record ↔ Stop
   - Recording indicator (already in DOM from B4, hidden) — show while `isRecording()`

3. **Dashboard recordings section** — `frontend/src/app/services/recordings.service.ts` (or extend rooms.service.ts) calls `GET /api/recordings` on dashboard init. Renders each recording: filename, room title, size (`Math.round(sizeBytes/1024)` KB), uploaded date, "Download" anchor → `/api/recordings/<filename>/download`. Empty state: "No recordings yet."

### Tests

**Backend** (`backend/tests/recording.test.ts`):
- POST /upload with binary body and headers → returns ok + file exists on disk with correct shape
- GET /api/recordings (no auth) → 401
- GET /api/recordings (auth + 2 rooms, 2 files for one room) → returns only that user's room's recordings, newest-first
- Download for non-owned room → 403

**E2E** (`e2e/tests/b5-recording/`):
- `record-start.spec.ts` (S5.1) — owner enters room, clicks Record, indicator visible, Record button label flips to Stop
- `record-stop-upload.spec.ts` (S5.2) — record for 2s, click Stop, file exists in `recordings/`, dashboard shows it in list with download link
- `record-mix.spec.ts` (S5.3) — owner records with 1 admitted peer (two-context). Stop, download the .webm, **verify audio track present via `ffprobe` or a `webm`-parsing micro-helper** (must be a real binary check, not just file-size). File size must be > minimum threshold (codex picks threshold based on 2s of opus, document in changes.md).

**Fake media note:** Playwright's `--use-fake-device-for-media-stream` produces a beep tone — good enough for "audio track is present" assertions. For multi-source mixing verification, asserting that the .webm has a non-zero audio track via ffprobe is sufficient — exact mix correctness is hard to assert; document that limitation in changes.md.

### Required artifacts

`projcore-run-2026-05-19/batch-5/`:
1. `changes.md` (full template + recording-mix architecture + threshold rationale for S5.3)
2. `scenarios-implemented.md` (S5.1-S5.3)
3. `test-report.md` (build + backend regression + B3 regression + B4 regression + B5 targeted)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — recording indicator visible during recording; dashboard recordings list with at least one item
7. **Decisions:** `decisions/2026-05-19-b5-<slug>.md` for each non-trivial call (filesystem-only vs DB table, S5.3 audio threshold, AudioContext sample rate choice, etc.)

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** install coturn / touch CF Tunnel / retire legacy entry — B6.
- **DO NOT** modify B1/B2/B3/B4 work unless adding a strictly necessary integration point (and document why).
- **DO NOT** add recordings to any persistent index file outside SQLite or filesystem — keep it simple.
- **DO NOT** restart legacy `meet-poc` PM2 entry.
- The `/upload` route in legacy was unauthenticated; **keep this behavior** (anyone in a call can upload — the room-existence check at the call layer is the gate). Document the trade-off.

## Completion protocol (UPDATED)

**New rule per B4 closure:** commit all batch work BEFORE posting the STATUS: DONE callback. The callback should reflect a clean working tree.

```
STATUS: DONE — B5 recording (client-mix + local upload) complete, S5.1-S5.3 green
```

OR BLOCKED / NEEDS-INFO.

Append to `progress.md` AND `callbacks.md`:
```
[projcore callback] batch-5 DONE — recording client-mix + /upload + dashboard list; 3 scenarios green
```

## Confirmation-prompt protocol

Same as prior batches.

## Model + reasoning guidance

- AudioContext mixing is the subtlest part — easy to get wrong on late-joining peers. Plan it carefully: `sourceFor.set(clientId, source)` so you can connect/disconnect cleanly when peers join/leave during a recording.
- MediaRecorder + Blob handling: keep it boring. `chunks: Blob[] = []`; `onstop → new Blob(chunks, {type: mimeType})`.
- For S5.3, `ffprobe -v error -select_streams a -show_entries stream=codec_name,duration -of csv '<file>'` returns codec + duration; that's a strong assertion. Falls back to file-size threshold if ffprobe unavailable; document either way.
- Cost-aware tier OK for backend; escalate if the AudioContext lifecycle (init, late-add, late-remove, cleanup) starts producing race conditions in the e2e test.

— /projcore (Claude, Opus, 2026-05-19)

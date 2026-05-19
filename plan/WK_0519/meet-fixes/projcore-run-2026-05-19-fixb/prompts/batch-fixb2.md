# Batch FIX-B2 — Transcript speaker-tagging (sidecar metadata next to each recording)

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Clean tree. This rule has been broken on M-B6 iter 1 and FIX-B3 iter 1 — please don't make it three.
**⚠️ Hard reminder #2:** This is a real feature, not a fix. Scope is locked below — do not expand into Whisper/STT integration, transcripts UI, or per-peer audio stems. We're shipping the *attachable metadata* that a future transcription pipeline will consume.

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** FIX-B2 (final batch of this fix run)
**Branch:** `fix/meet-fixb2-transcript-tagging` off current HEAD (`f8a6744`).

**Source:** JROM verbatim — *"on the transcribing as well, think about having to log w/c voice is w/c so that when we transcribe them is easier to attach a name to the transcript discuss adding this as well"*. Your own triage design (from `progress.md`'s `[lead triage]` line) is the locked spec; this brief codifies it.

## What this batch ships

### (1) Sidecar metadata schema

For every recording uploaded, save an adjacent `<recording_basename>.meta.json` with:

```json
{
  "schemaVersion": 1,
  "sessionId": "string",
  "roomId": "string",
  "recordingStartedAtIso": "ISO8601",
  "recordingDurationMs": <number>,
  "participants": [
    { "clientId": "string", "displayName": "string", "isHost": <bool>, "joinedAtMs": <ms-relative-to-recordingStart>, "leftAtMs": <ms or null> }
  ],
  "segments": [
    { "startMs": <ms-relative-to-recordingStart>, "endMs": <ms>, "clientId": "string", "source": "active-speaker-rms" }
  ]
}
```

`segments` carries the dominant speaker per time window. Use `ActiveSpeakerService`'s existing 8Hz RMS samples; **collapse consecutive same-speaker frames into one segment** with a minimum-segment-duration of 250ms (configurable constant). If no one is the active speaker at a given window, omit that window (don't emit "silence" segments — the future transcription pipeline can infer silence).

`participants` is a snapshot at recording start PLUS any subsequent joins/leaves during recording. Stable `clientId` is the WS-assigned id (existing `myId` / peer `id`).

### (2) Backend endpoint

In `backend/src/modules/recording/index.ts`:

```
POST /api/recordings/upload-metadata
Auth: required
Body: JSON { filename: string, metadata: object }
```

- Validate `filename` ends in `.webm|.mp4|.aac` (existing extension allowlist) and is traversal-safe (same checks as bulk-delete).
- Validate the recording file actually exists at `getRecordingsDir()/filename`.
- Validate `metadata` is an object and `metadata.schemaVersion === 1`. Reject malformed.
- Parse the recording filename to extract `roomId`; check ownership via `getRoom(roomId)`. Return 403 if not owner.
- Write `getRecordingsDir()/<filename>.meta.json` (so `<original>.webm.meta.json`).
- Return `{ ok: true, metaFile: "<basename>.meta.json", bytes: <number> }`.

Also extend the existing `GET /api/recordings` list response: when listing each recording, check if its `<file>.meta.json` exists and include `hasMetadata: boolean` + `speakerCount: number | null` in the entry. Frontend can use this without an extra round-trip.

### (3) Frontend `RecorderService`

In `frontend/src/app/services/recorder.service.ts`:

- Inject `ActiveSpeakerService` and accept the participants snapshot from RoomPage on start.
- On `start(params)` accept `{ participants: ParticipantSnapshot[], sessionId: string, roomId: string }`. Record `recordingStartedAt` and a 0-based `t0`.
- Subscribe to `ActiveSpeakerService.active$` (or equivalent signal). For each frame:
  - If activeSpeakerId is null → close any in-progress segment.
  - If activeSpeakerId changed from the open segment → close the open segment if it's ≥ 250ms; open a new segment.
  - Otherwise → extend the open segment's endMs.
- On peer join/leave (passed in via subscribe or via RoomPage), push to `participants[]` with relative timestamps.
- On `stop()` (existing flow):
  - Close any open segment.
  - Build the metadata JSON per schema above.
  - After the existing audio-blob upload completes, POST `/api/recordings/upload-metadata` with `{ filename: <returned-from-upload>, metadata }`. On 200 → emit completion status as today; on failure → log + emit a non-fatal warning (the audio itself is already saved; metadata is best-effort).

### (4) Frontend `RoomPage` wiring

In `frontend/src/app/pages/room/room.page.ts`:
- When user clicks Record, pass `{ participants: <current peer list w/ host flag + names>, sessionId: <from session signal>, roomId }` to `recorder.start(...)`.
- When a peer joins/leaves while recording, push an event to `recorder.notifyParticipantChange(...)`.

### (5) Frontend Recordings page minor enhancement (optional polish)

When a recording has `hasMetadata: true`, show a small badge "Speakers: N" on the row. If `false`, no badge. This is **nice-to-have** — if the time-budget gets tight, skip it. The metadata file is what matters.

## Validation

`e2e/tests/v3-fixb2-transcript/transcript-tagging.spec.ts`:

1. **Test 1 — Single-peer recording produces metadata with 1 participant + 0+ segments.** Host opens TEST_ROOM01, starts recording, speaks 3 seconds, stops. Backend has both `<file>.webm` AND `<file>.webm.meta.json`. Read meta: `participants.length === 1` (host), `schemaVersion === 1`, `sessionId` non-empty, `recordingDurationMs > 2500 && < 4000`.

2. **Test 2 — Two-peer recording captures both speakers in segments.** Host + guest in TEST_ROOM01. Use the existing fake-media tones (different frequencies per context — already done in FIX-B1 race spec) so ActiveSpeakerService can distinguish RMS. Host records 8s, alternating who's "speaking" via fake media file. Stop. Assert meta `participants.length === 2`, both names present, and `segments[]` has ≥ 2 entries with `clientId` matching the 2 participants. Total segment duration > 0.

3. **Test 3 — Mid-recording peer leave is captured.** Host + guest, start recording, guest leaves at ~2s, host continues 3s, stops. Assert the guest's `leftAtMs > 1500 && < 3000` and host's `leftAtMs === null`.

4. **Test 4 — Recordings list exposes hasMetadata + speakerCount.** Existing seeded recordings (from FIX-B3 spec or fresh) — after meta upload, `GET /api/recordings` returns `hasMetadata: true` + `speakerCount: <N>` for that row.

## Backend tests

Add to `backend/tests/recording.test.ts`:
- Upload-metadata happy path: recording exists + valid JSON → 200 + file written
- Upload-metadata rejects: traversal filename → 400; nonexistent recording → 404; not-owner → 403; bad schemaVersion → 400
- List enrichment: GET /api/recordings returns `hasMetadata: true` for recordings with sidecars + correct `speakerCount`

## Regression suite (mandatory)

- `npm test -w backend` — GREEN (51 → 55+ with new tests)
- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — **R8.1 holds (9th consecutive batch)**
- New FIX-B2 spec — PASS

## Required artifacts

`plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb2/`:
1. `changes.md` (verbatim user report + schema + code-change inventory)
2. `scenarios-implemented.md`
3. `test-report.md`
4. `review.md`
5. `independent-validation.md`
6. `screenshots/recordings-with-meta-badge.png` (if (5) shipped) OR `screenshots/meta-json-sample.png` (a screenshot of `cat` output of a real .meta.json)
7. **Decisions:** `decisions/2026-05-19-fixb2-transcript-metadata.md` covering: schema choice (sidecar JSON vs DB table), segment-collapse threshold (250ms), best-effort failure semantics

## Scope (hard limits)

- **DO** items 1-4 (item 5 optional). Sidecar JSON + endpoint + recorder wiring + e2e.
- **DO NOT** integrate Whisper or any STT.
- **DO NOT** add a transcripts UI page (the existing `/app/transcripts` stays a stub — transcription pipeline is a future run).
- **DO NOT** implement per-peer audio stems — the mixed-recording + active-speaker timeline is the agreed minimal design.

## Completion protocol

**COMMIT BEFORE STATUS: DONE** (please). Append to `progress.md`:
```
[projcore callback] fixb2 DONE — sidecar metadata + active-speaker timeline + recordings list enrichment
```

Then `STATUS: DONE — FIX-B2 …`.

— /projcore (Claude, Opus, 2026-05-19)

# Changes — per-user recording (R8)

**Date:** 2026-06-20 (Manila)
**Branch:** feat/remote-audio-e2e-20260619
**Implementer:** sonnet (direct)

---

## Problem

Existing recording mixes ALL participants into one `MediaStreamAudioDestinationNode` → one `.webm`. Whisper transcribes it as an undifferentiated blob — cross-talk makes speaker attribution unreliable and per-speaker naming impossible.

---

## Fix

Additive parallel per-user MediaRecorder map. Each participant gets their own recorder operating on their raw inbound `MediaStream` (no extra AudioContext). Mixed recording path is completely unchanged.

---

## Frontend — `recorder.service.ts`

### New state

```typescript
private perUserRecorders = new Map<string, {
  recorder: MediaRecorder; chunks: Blob[]; displayName: string; stopped: boolean
}>();
```

### `start()` — additive suffix

After the existing mixed recorder starts, iterates `localStream` + `peerStreams` and calls `startPerUserRecorder()` for each. Derives `localDisplayName` from the `isHost: true` participant entry in metadata. Peer display names come from the metadata participants map.

### `startPerUserRecorder(clientId, stream, displayName)` — new private method

Passes the stream directly to `new MediaRecorder(stream, recOpts)` — no extra AudioContext. Stores recorder + chunk accumulator in `perUserRecorders`. Uses same MIME type and iOS timeslice guard as the mixed recorder.

### `addStream()` — one additive suffix

If recording and no per-user recorder exists for this clientId yet (e.g., peer joined mid-recording), starts a per-user recorder. Looks up displayName from `this.participants`.

### `removePeerStream()` — additive suffix

When a peer leaves mid-recording, stops their per-user recorder immediately (blob preserved in map for later upload).

### `stopAllPerUserRecorders()` — new private method

Stops all still-running per-user recorders and returns `Promise<void>` that resolves when all `onstop` events fire.

### `stop()` — additive parallel step

```typescript
const perUserDone = this.stopAllPerUserRecorders();
// ... existing recorder.stop() ...
return Promise.all([stopped, perUserDone]).then(results => results[0]);
```

Mixed blob returned unchanged. Per-user recorders stop in parallel with the mixed recorder.

### `discard()` — additive prefix

Stops any running per-user recorders and clears the map before calling `finalizeRecording`.

### `uploadPerUser(roomId)` — new public method

Uploads each per-user blob to `/upload` with three extra headers:
- `X-PerUser: 1`
- `X-DisplayName: <sanitized displayName>`
- `X-ClientId: <clientId>`

Clears `perUserRecorders` after upload. Called fire-and-forget from room.page.ts after the mixed upload succeeds.

---

## Frontend — `room.page.ts`

**`toggleRecording()`** — one line after successful upload:
```typescript
void this.recorder.uploadPerUser(this.roomId);
```

**`endForAll()`** — same, inside the blob guard block.

---

## Backend — `recording/index.ts`

### `sanitizeDisplayNameSlug(name)` — new helper

Converts displayName to a safe filename slug (alphanum only, max 24 chars lowercase).

### `participantPathFor(filename)` — new helper

Returns `${filepath}.participant.json` sidecar path.

### `/upload` — additive header reads

```typescript
const isPerUser = req.header('X-PerUser') === '1';
```

If `isPerUser`: embeds `sanitizeDisplayNameSlug(rawDisplayName)` into the filename between roomSlug and rand:
```
${stamp}_${sessionId}_${roomId}_${roomSlug}_${nameSlug}_${rand}.${ext}
```

`parseRecordingFilename()` still matches (the `_.+_` wildcard section now spans roomSlug + nameSlug).

After file write: writes `.participant.json` sidecar: `{ displayName, clientId, isPerUser: true }`.

`scheduleTranscription()` fires unchanged — Whisper transcribes each per-user file independently. Each file is one speaker → single-speaker clean transcript.

### `GET /api/recordings/named-transcript/:sessionId` — new endpoint

Registered **before** the `:filename` sub-routes to avoid path ambiguity.

- Finds all `.participant.json` sidecars for the sessionId owned by the authenticated user
- Reads each per-user transcript (`.transcript.json`)
- Overrides `name` field with participant's `displayName`
- Merges all lines, sorts by `startMs`
- Returns:
  ```json
  {
    "sessionId": "...",
    "speakers": ["JROM", "Peer2", "local2", "agent"],
    "transcript": [{ "startMs": 0, "name": "JROM", "text": "..." }, ...]
  }
  ```

### `deleteRecordingSidecars()` — additive

Adds `participantPathFor(filename)` to the sidecar cleanup list so per-user sidecars are deleted when a recording is deleted.

---

## What is NOT touched

- Mixed recorder: `AudioContext`, `dest`, `MediaStreamAudioDestinationNode`, `this.recorder`, `chunks`, `upload()` — identical
- `resumeAudioContext()` / REC1 mobile path — touches only `this.ctx`, orthogonal to per-user recorders
- `addPeerStream()`, `recordedClientIds()` — unchanged
- Recordings list rendering (`listRecordingsForUser`) — per-user files appear as normal entries (named `..._${nameSlug}_${rand}.webm`), distinguishable by filename pattern
- `transcribe.py`, Whisper model selection — unchanged; per-user files transcribed as normal single-speaker audio

---

## Deploy

- `npm run build` FE ✓ (2 pre-existing warnings: `@mediapipe/selfie_segmentation` CommonJS + stencil glob)
- `npm run build` BE ✓ (clean, no errors)
- `pm2 restart meet-poc-fe meet-poc-be` ✓
  - meet-poc-fe: id 7, online, restart #56
  - meet-poc-be: id 6, online, restart #35

---

## Smoke (unit-level)

13/13 FE wiring checks: perUserRecorders field, startPerUserRecorder called in `start()` (local + peers), called in `addStream()`, stopped in `removePeerStream()`, Promise.all in `stop()`, cleared in `discard()`, `uploadPerUser()` headers (X-PerUser, X-DisplayName, X-ClientId), direct-stream MediaRecorder (no extra AudioContext).

12/12 BE checks: sanitizeDisplayNameSlug, participantPathFor, header reads, per-user filename slug, participant sidecar write, named-transcript endpoint, sorted allLines, speakers array, deleteRecordingSidecars cleanup, [per-user] log marker.

Full 4-party speech call (grok + Peer2) is the next validation gate.

---

## Verdict

**STATUS: DONE**

Per-user recording wired, deployed, smoke-passed. Mixed recording untouched.
New endpoint: `GET /api/recordings/named-transcript/:sessionId`

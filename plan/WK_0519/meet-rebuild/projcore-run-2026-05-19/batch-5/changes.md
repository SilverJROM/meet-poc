# Batch 5 Changes — Recording

## Summary

- Added filesystem-backed recording upload/list/download routes.
- Added client-side `AudioContext` mix recording via `MediaRecorder`.
- Enabled the call Record button and visible recording indicator.
- Filled the dashboard Recordings section with saved files and download links.
- Added backend recording tests and B5 Playwright scenarios.

## Recording Mix Architecture

- `RecorderService.start(localStream, peerStreams)` creates one `AudioContext` and one `MediaStreamAudioDestinationNode`.
- The local stream is connected as `sourceFor["local"]`.
- Each admitted remote peer stream is connected as `sourceFor[clientId]`.
- `RoomPage` calls `recorder.addPeerStream()` when peer streams appear during a recording and `removePeerStream()` when a peer leaves.
- `MediaRecorder` records `dest.stream` using `audio/webm;codecs=opus` when supported, falling back to `audio/webm`.
- Stopping returns one Blob, then uploads it with `POST /upload`, `X-Ext: webm`, and `X-Room: <roomId>`.

## Backend Recording Storage

- `POST /upload` is intentionally unauthenticated, matching the legacy PoC. The room page's room-existence and signaling admission flow remains the gate.
- `GET /api/recordings` and downloads require auth.
- No SQLite table was added. Filenames embed the room id so the list/download routes can verify ownership from the filesystem:

```text
<timestamp>_<roomId>_<roomTitleSlug>_<rand6>.webm
```

This extends the legacy title-slug filename with `roomId`, which is necessary for owner-filtered filesystem listing without a DB table.

## S5.3 Threshold

S5.3 records for at least 2.4 seconds with fake media and asserts:

- saved/downloaded file size is greater than 1000 bytes
- `ffprobe` finds an Opus audio stream

The 1 KB floor is deliberately low to avoid codec/container variance while still catching empty blobs. `ffprobe` is the stronger assertion.

## Touched Paths

- `backend/src/modules/recording/index.ts`
- `backend/src/server.ts`
- `backend/tests/recording.test.ts`
- `frontend/src/app/services/recorder.service.ts`
- `frontend/src/app/services/recordings.service.ts`
- `frontend/src/app/components/controls-bar/`
- `frontend/src/app/pages/room/`
- `frontend/src/app/pages/dashboard/`
- `e2e/tests/b5-recording/`

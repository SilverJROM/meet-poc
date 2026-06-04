# B21c Review

Timestamp: 2026-06-04T19:09:33Z

## Scope Review
- Touched only:
  - `frontend/src/app/pages/room/room.page.ts`
  - `frontend/src/app/services/recorder.service.ts`
  - `frontend/src/app/services/recorder-leaks.spec.ts`
  - B21c validation artifacts and callback
- Did not touch SFU, signaling, transport, media acquisition, active speaker implementation, `withTimeout` internals, REC7/REC9/REC10, or B18 REC1/2/3 room-recording helpers.

## Mechanism Review
- REC4: host stop/upload path now matches the existing cleanup-path timeout style and prevents a stuck recording UI by discarding state on stop timeout.
- REC5: finalization is per session and reset in `start()`. `discard()` avoids a second `MediaRecorder.stop()` while stop is pending. Late `onstop` after discard is a no-op for service cleanup/state.
- REC6: zero-audio stream skip remains unchanged except for a targeted warning including `clientId`.
- REC8: `resolveRecordingMime()` prefers actual `MediaRecorder.mimeType`, maps webm/ogg/mp4/mp4a/aac extensions, and upload headers follow the resolved blob MIME/extension.

## Regression Review
- Existing recorder source dedupe behavior remains covered by `recorder-leaks.spec.ts`.
- Existing peer-resumed and stale recorder source eviction remain covered by `room-recording.spec.ts`.
- Existing active speaker graph dedupe remains covered by `active-speaker-leaks.spec.ts`.

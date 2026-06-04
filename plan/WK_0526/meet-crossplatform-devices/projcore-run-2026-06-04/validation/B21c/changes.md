# B21c Changes

Timestamp: 2026-06-04T19:09:33Z

## User Report
Verbatim dispatch summary: "B21c = REC4 wrap the host toggle-recording stop at room.page ~1342 in the EXISTING withTimeout helper ~3683 like the cleanup path ~1475 already does; REC5 fix the recorder.service stop/discard double-stop and double-cleanup race with a finalize-once guard so cleanup and isRecording run exactly once and discard does not call recorder.stop twice; REC6 console.warn when addStream skips a stream for zero audio tracks; REC8 stamp the ACTUAL recorded mime from this.recorder.mimeType onto the blob type, extension, and upload Content-Type with fallback to current."

## Root Cause
- REC4: host toggle-recording awaited `this.recorder.stop()` directly, unlike the cleanup path, so a browser that never delivered `MediaRecorder.onstop` could leave the UI waiting forever.
- REC5: `stop()` and `discard()` both owned recorder stopping and cleanup. If discard ran while stop was pending, the browser could receive a second `recorder.stop()` and cleanup plus `isRecording=false` could run twice.
- REC6: `addStream()` returned silently for zero-audio streams, hiding host-local no-audio recording failures.
- REC8: output labeling followed the selected/fallback MIME instead of `MediaRecorder.mimeType`, so negotiated formats such as Firefox ogg could be uploaded as webm.

## Per-file WHY
- `frontend/src/app/pages/room/room.page.ts`: reused existing `withTimeout` around host toggle stop and upload. On stop timeout, sends stopped state, discards recorder state, and returns a non-recording status.
- `frontend/src/app/services/recorder.service.ts`: added per-session finalize-once state reset in `start()`, centralized finalization, guarded `discard()` from double-stopping pending `stop()`, added zero-audio warning, and exported `resolveRecordingMime()` for deterministic MIME/extension mapping.
- `frontend/src/app/services/recorder-leaks.spec.ts`: added focused npx-tsx assertions for REC5/REC6/REC8 while preserving existing B17/B18 recorder regression coverage.

## Caveats
- Real iOS `onstop` hang and real Firefox ogg playback remain seat/device validation items. Unit proof verifies the timeout path, finalize-once behavior, and negotiated MIME labeling logic.
- No autonomous scope expansion beyond REC4/REC5/REC6/REC8.

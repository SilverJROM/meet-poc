# Decision - B21c Recorder Finalize and MIME Labeling

Timestamp: 2026-06-04T19:09:33Z

## Decision
Use a per-session finalize-once guard in `RecorderService`, reset in `start()`, and centralize recorder output labeling through `resolveRecordingMime(actual, fallback, fallbackExtension)`.

## Rationale
- A permanent latch would break subsequent recordings, so lifecycle finalization must reset on each `start()`.
- `discard()` must be able to tear down immediately without issuing a second `MediaRecorder.stop()` when `stop()` is already pending.
- `MediaRecorder.mimeType` is the browser-negotiated output format and is more authoritative than the selected constructor fallback for blob type and upload headers.
- Extension mapping needs explicit webm, ogg, and mp4/mp4a coverage so Firefox ogg and Chrome webm produce playable file labels.

## Consequences
- Late `onstop` after discard no longer owns cleanup or recording state.
- Unknown actual MIME keeps the actual `Content-Type` but falls back to a known extension from the previous/fallback MIME.

# B21c Scenarios

Timestamp: 2026-06-04T19:09:33Z

## REC4 - Bounded host stop
- Given the host is recording from the room toggle path.
- When `recorder.stop()` does not settle within 8000 ms.
- Then the room path sends `recording-state: stopped`, discards recorder state, and returns a non-recording status instead of hanging forever.
- When `recorder.stop()` does settle, upload is also bounded with the same existing `withTimeout` helper.

## REC5 - Stop/discard finalize once
- Given `stop()` has called `MediaRecorder.stop()` and is waiting for `onstop`.
- When `discard()` runs before `onstop`.
- Then `discard()` does not call `MediaRecorder.stop()` again, cleanup and `isRecording=false` happen once, and late `onstop` does not clean up again.
- Given `discard()` runs against an active recorder with no pending stop.
- Then it stops the recorder once, tears down local state, and a later browser `onstop` is a no-op.
- A new `start()` resets the per-session guard so later recordings can finalize normally.

## REC6 - Zero-audio stream diagnostic
- Given `addStream()` receives a stream with zero audio tracks.
- Then it still skips the stream, but emits `console.warn('recording stream skipped: no audio tracks', { clientId })`.

## REC8 - Actual MIME labeling
- Given the browser negotiates a recorder MIME different from the selected fallback.
- Then the blob type, stored extension, upload `Content-Type`, and upload `X-Ext` use the actual negotiated MIME.
- Covered mappings: webm -> webm, ogg -> ogg, mp4/mp4a -> mp4, aac -> aac; unknown actual MIME keeps its Content-Type and falls back to the known extension.

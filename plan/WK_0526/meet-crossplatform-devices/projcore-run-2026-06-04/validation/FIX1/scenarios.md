# FIX1 Scenarios

## REC1-iOS

1. Recording is active and the recorder AudioContext is suspended after lifecycle freeze/resume.
   - Expected: `RecorderService.resumeAudioContext()` awaits `ctx.resume()`.
   - Expected: rejection is warned and swallowed; lifecycle resume never throws from recorder resume.

2. Recording is inactive or the recorder AudioContext is already running.
   - Expected: `resumeAudioContext()` is a no-op.

3. Room lifecycle resumes from a persisted `pageshow` while in-call and recording.
   - Expected: `resumeAfterLifecycleFreeze()` invokes recorder AudioContext resume beside the existing media/SFU recovery path.
   - Expected: existing SFU republish logic remains unchanged.

## REC2

1. A peer is already tracked with the same `MediaStream` object and recorder sync runs again.
   - Expected: no source disconnect, no replacement source node, `sourceCount` stable.

2. A peer is already tracked but receives a different `MediaStream` object.
   - Expected: old source disconnects, new source connects, `sourceCount` remains stable.

3. A peer source is removed and later re-added with the same stream object.
   - Expected: `streamFor` was cleared on removal, so the re-add creates a new source and is not wrongly suppressed.

4. Recorder sync evicts dropped remote peers.
   - Expected: local source is untouched and only dropped/changed remote sources are disconnected.

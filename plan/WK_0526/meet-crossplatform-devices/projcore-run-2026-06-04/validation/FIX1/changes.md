# FIX1 Changes

## User Report Verbatim

FIX1 = REC1-iOS (expose RecorderService.resumeAudioContext() that resumes the recording AudioContext when recording+suspended, never throws, and call it from room.page resumeAfterLifecycleFreeze guarded by isRecording, so an iOS background mid-recording doesn't leave the recording silent) + REC2 (make addStream a no-op when the clientId is already tracked with the SAME stream object, so the recorder-sync effect stops disconnecting/reconnecting unchanged peers' sources on every peers-signal change — a genuine stream change still replaces). Behavior-preserving for everything else.

## Root Cause

REC1-iOS: `RecorderService.start()` resumed a suspended recording AudioContext before `MediaRecorder` start, but the room lifecycle resume path did not resume the recorder context after a background freeze. If mobile Safari/Android suspended the recording AudioContext mid-recording, the graph could remain silent.

REC2: `RecorderService.addStream()` replaced an existing client source unconditionally. `syncRecorderPeerStreams()` replays active peers on every peers-signal change, so unchanged peer stream objects were disconnected and reconnected, creating avoidable source churn.

## Per-file Why

- `frontend/src/app/services/recorder.service.ts`
  - Added `resumeAudioContext()` as a recording+suspended-only, never-throwing public resume helper.
  - Added `streamFor` so `addStream()` can distinguish same-object replays from genuine stream replacement.
  - Kept `streamFor` in lockstep with `sourceFor`: reset in `start()`, deleted in `removePeerStream()`, and cleared in `cleanupAudioGraph()`.

- `frontend/src/app/pages/room/room.page.ts`
  - Added a guarded recorder AudioContext resume call inside `resumeAfterLifecycleFreeze()`.
  - Left the B12 SFU health/reset/republish logic unchanged.

- `frontend/src/app/services/recorder-leaks.spec.ts`
  - Added REC1 lifecycle resume no-op/resume/rejection coverage.
  - Added REC2 same-stream no-churn, changed-stream replacement, local-untouched, and streamFor-clear-on-remove coverage.

## No Other Behavior Change

No SFU/signaling/acquisition/reconcile paths were changed. The finalize-once guard was not touched. Recorder source membership semantics remain unchanged: same stream replays are skipped, genuine stream changes still replace, and dropped peers still evict.

Autonomous decisions: none.

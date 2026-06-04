# B18 Changes

## User Report
Recording must Just Work like Zoom/Meet: a host who hits Record on a phone must get AUDIBLE audio, and every participant - including someone who dropped and reconnected - must be captured, with no stale/dead sources bloating the mix.

## Root Cause
REC1: `RecorderService.start()` created an `AudioContext` and started `MediaRecorder` without resuming a suspended context. On mobile browsers, that can leave the mixer destination silent.

REC2: the room recorder-sync effect built `activePeerIds` from `this.peers()` and then iterated the same `this.peers()` list for removals, so the removal condition could never be true for a dropped peer no longer present in the list.

REC3: `peer-resumed` removed the old SFU peer and rekeyed room state, but did not notify the recorder that `oldClientId` left. The old recorder source/metadata could linger while the resumed participant arrived under a new id.

## Files Changed
- `frontend/src/app/services/recorder.service.ts`: made `start()` async; if the new context is suspended, it now awaits `ctx.resume()` before constructing/starting `MediaRecorder`. Resume failures are logged and recording proceeds. Added `recordedClientIds()` returning a snapshot of `sourceFor` keys.
- `frontend/src/app/pages/room/room.page.ts`: awaits `recorder.start()` before sending `recording-state: started`; delegates recorder peer sync and peer-resumed recording updates to focused helpers.
- `frontend/src/app/pages/room/room-recording.ts`: added deterministic room recording helpers for peer-source sync and peer-resumed recording metadata/source eviction.
- `frontend/src/app/services/recorder-leaks.spec.ts`: added REC1 and REC2 assertions while preserving B17 recorder leak coverage.
- `frontend/src/app/pages/room/room-recording.spec.ts`: added REC3 assertion that old id is evicted and the resumed peer is captured under the new id.

## Caveats
Real mobile audible recording and real drop/reconnect during recording were not device-tested here. The deterministic specs prove the code mechanisms; JROM's device seat remains the live iOS/Android/browser proof.

Autonomous decisions: `plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/decisions/2026-06-04-b18-recording-resume-eviction.md`.

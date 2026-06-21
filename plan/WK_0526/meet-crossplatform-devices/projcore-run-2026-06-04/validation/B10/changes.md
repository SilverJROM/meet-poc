# Batch B10 Changes

## Branch: `feat/crossplatform-devices-20260604`

Cut from current branch checkpoint @ `f9a21f0`. Not committed in this pass; projcore owns final validation and merge flow.

## User Report (verbatim from brief)

"the 'meeting-ended' handler only flushDiagnosticsLog + ws.close() + toast — it does NOT call cleanupCall()/media.stopLocal()/close PC + AudioContexts/stop watchdogs. So after the HOST ends the meeting, every participant's camera/mic STAY ON and the RTCPeerConnection + AudioContexts + keepalive/watchdog timers keep running (privacy + resource)."

## Root Cause (mechanism-level)

`RoomPage.handleMessage()` handled `meeting-ended` with only diagnostics flush, WebSocket close, and non-host toast display. It bypassed `cleanupCall(false)`, so local media tracks, the SFU peer connection, AudioContexts, recorder state, remote-audio graph, and watchdog/keepalive timers were not released on host-ended calls.

## Code Changes

- `frontend/src/app/pages/room/room.page.ts` - Changed `meeting-ended` handling to capture `wasHost`, run `cleanupCall(false)`, then restore the existing non-host meeting-ended toast after teardown.
- `plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md` - Appended B10 PROPOSED and DONE callbacks.

## Commits

- Not committed - held for projcore independent validator pass.

## Standing Rules

- Host-ended call handling must use the same full call teardown path as leave/cleanup before showing any terminal UX.

## Verification

- Build: PASS (`npx ng build` from `frontend/`)
- Code-path inspection: PASS
  - `cleanupCall(false)` calls `sfuClient.closeLiveTracksForExit()`; that closes the SFU `RTCPeerConnection`, clears SFU state, and is idempotent.
  - `cleanupCall(false)` calls `media.stopLocal()`; `stopCurrentMedia({ closeAudioContext: true })` closes the media AudioContext, stops screen track, and stops every local camera/mic track.
  - `cleanupCall(false)` calls `remoteAudio.reset()`; it clears sources, stops remote audio keepalive, and closes the remote AudioContext.
  - `cleanupCall(false)` stops diagnostics, remote voice, mic silence, lobby self-test, connection-quality, local recovery, preflight, waiting-room, and remote-audio keepalive timers.
  - Non-host toast is set after cleanup, because cleanup clears `meetingEndedToastOpen`.

## Bug Reproductions

- Before: mechanism reproduced by code inspection - `meeting-ended` bypassed `cleanupCall(false)`.
- After: handler now runs full teardown before restoring non-host toast. Real camera light off remains JROM seat validation.

## Caveats

- [PRE-EXISTING] `npx ng build` still reports warnings for unused `DatePipe` in `RoomsPage`, Stencil empty glob, and Mediapipe CommonJS. Not introduced by B10.

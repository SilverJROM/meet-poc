# v2-B5 Changes

## User Report

Invoke `$lead` for v2-B5. Frontend-only lobby device preview: Pattern X pre-grant on lobby mount, mic meter, device selectors, permission-denied placeholder with Retry, and join carries the pre-acquired stream into the call. Commit before `STATUS: DONE`.

## Root Cause Mechanism

Before B5, `/room/:id` requested microphone/camera only after the user clicked Join. That meant the lobby had no preview, no device selection, no mic feedback, and the call transition always acquired media at the highest-friction point. B5 moves media acquisition into the lobby while preserving the existing call state machine.

## Code Changes

- `frontend/src/app/services/media.service.ts`
  - Added typed `MediaError` mapping for denied, no-devices, and unknown errors.
  - Added `preflight`, `enumerateDevices`, and `reacquire`.
  - Changed `getLocalStream` to reuse an existing pre-acquired stream.
  - Added `getMicLevel` with an `AnalyserNode` sampled every 125ms.
  - Added cleanup for mic-level interval/source and local media tracks.
- `frontend/src/app/components/mic-meter/*`
  - Added 8-bar visual mic meter.
- `frontend/src/app/components/lobby-preview/*`
  - Added lobby preview with camera tile/placeholder, mic meter, microphone selector, and camera selector.
- `frontend/src/app/pages/room/*`
  - Calls `MediaService.preflight({audio:true, video:cameraRequested})` when the lobby state is reached.
  - Stores device lists, selected device IDs, mic level signal, and permission error state.
  - Reacquires media when camera checkbox or device selectors change.
  - Join now reuses `media.localStream()` rather than calling `getUserMedia` again.
  - Adds the permission-denied/no-devices placeholder and Retry loop.
  - Keeps `window.__meetDebug.localStream` pointed at the active pre-acquired stream.
- `e2e/tests/v2-b5-lobby/*`
  - Added B5 lobby preflight, mic meter, selector, denied, camera-on screenshot, and stream-carry tests.
- `project_specs.md`
  - Documented B5 lobby media ownership and deferred test-mic playback.

## MediaService Extension Summary

| Method | Purpose |
|---|---|
| `preflight({audio, video})` | Initial lobby `getUserMedia` with typed error mapping |
| `enumerateDevices()` | Returns `{audioInputs, videoInputs}` after permission is granted |
| `reacquire({audioDeviceId, videoDeviceId, video})` | Replaces the active local stream when device choices or camera state change |
| `getMicLevel(stream)` | Returns a signal updated by RMS analysis at 8 Hz |
| `getLocalStream(cameraOn)` | Reuses the current stream if present; only acquires as fallback |

## Test-Mic Decision

Skipped the optional one-second MediaRecorder playback button in B5. It adds an extra recording/playback path that is not needed for B6-B8 plumbing, and the mic meter already verifies live microphone input. Decision logged in `decisions/2026-05-19-v2-b5-test-mic-deferred.md`.

## Modules Touched

- Frontend media service
- Frontend room lobby page
- New lobby preview and mic meter components
- B5 Playwright tests/config
- Project architecture docs

## Caveats

- Permission-denied copy and no-devices handling are intentionally placeholder-level; B7 owns polished device failure UX.
- Device selectors are native `<select>` controls for predictable browser behavior and simple accessibility.
- No backend, signaling, recording, Settings, or call-grid overhaul work was added.

## Autonomous Decisions

- Logged `decisions/2026-05-19-v2-b5-test-mic-deferred.md`: defer optional Test mic playback.
- Logged `decisions/2026-05-19-v2-b5-mic-meter-threshold.md`: bar N activates when normalized RMS is greater than `N / 8`.
- Logged `decisions/2026-05-19-v2-b5-retry-preflight.md`: Retry re-runs preflight in place.

# v2-B7 Changes

## User Report

Invoke `$lead` for v2-B7. Implement controls polish, host-only Record button, shared "Host is recording" banner, polished device-failure UX, and local camera-off avatar verification. Commit before `STATUS: DONE`.

## Code Changes

- `frontend/src/app/components/controls-bar/*`
  - Replaced text-flip controls with fixed-size icon-state buttons.
  - Added `aria-pressed`, action `aria-label`s, hover/focus states, and 46px touch targets.
  - Added `isHost` input and removed the Record button from the DOM for non-hosts.
  - Removed the old inline recording indicator; the new banner is the recording indicator.
- `frontend/src/app/components/recording-banner/*`
  - Added a standalone banner component with red pulse dot, "Host is recording", and duration counter.
- `frontend/src/app/pages/room/*`
  - Passes host state into controls.
  - Sends `recording-state` WS messages when host starts/stops local recording.
  - Handles `recording-started` / `recording-stopped` WS broadcasts to show/hide the banner for all admitted peers.
  - Promotes lobby media failures to typed states: denied, no-devices, video-denied-audio-ok, unknown.
  - Adds non-blocking mid-call microphone disconnected notice via local audio track `onmute`/`onended`.
  - Keeps local camera-off tile behavior from B6 and verifies it in B7.
- `frontend/src/app/services/ws.service.ts`
  - Added frontend wire types for recording broadcasts and outgoing `recording-state`.
- `e2e/tests/v2-b7-controls/*`
  - Added serial B7 Playwright suite covering all assigned scenarios.

## Recording Banner Behavior

The host starts local `MediaRecorder` first, then sends `{type:'recording-state', state:'started'}`. The backend broadcasts `recording-started`, and both host and guests render the same banner path. On Stop, the host stops the recorder, sends `recording-state:stopped`, then uploads the blob; the banner disappears from the backend broadcast while upload continues.

## Device Failure UX

| Case | Behavior |
|---|---|
| Microphone denied | Blocking error with browser-settings guidance and Retry |
| No microphone/devices | Blocking error with refresh guidance and no Retry |
| Camera denied while mic works | Non-blocking warning; user may join audio-only |
| Unknown media failure | Blocking error with original message and Retry |
| Mid-call mic loss | Non-blocking in-call notice: "Microphone disconnected. Please refresh to rejoin." |

## Autonomous Decisions

- Logged `decisions/2026-05-19-v2-b7-icon-controls.md`: use outline Ionicons with stateful aria labels and 46px targets.
- Logged `decisions/2026-05-19-v2-b7-recording-stop-order.md`: broadcast stopped after local recorder stop and before upload.
- Logged `decisions/2026-05-19-v2-b7-device-copy.md`: exact user-facing copy for denied/no-devices/audio-only/mid-call cases.
- Logged `decisions/2026-05-19-v2-b7-mid-call-device-loss.md`: track `onmute`/`onended` drives the non-blocking notice.

## Caveats

- Backend was not modified, per B7 scope. Existing B2 recording WS broadcasts are reused.
- Participant sidebar, host kebab actions, leave-confirm dialog, and active-speaker remain B8 scope.

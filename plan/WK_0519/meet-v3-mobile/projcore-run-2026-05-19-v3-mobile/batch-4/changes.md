# M-B4 Changes

## User Report

Invoke `$lead` for M-B4 mobile lobby. Implement mobile camera switch with `facingMode`, single-column mobile device selectors, and the critical AudioContext gesture-gated mic-meter activation. Assert camera switching on the constraint object, not fake-media track IDs. Commit before `STATUS: DONE`.

## Code Changes

- `frontend/src/app/services/media.service.ts`
  - Adds `audioContextActivated` state.
  - Defers AudioContext creation on mobile until `activateMicPreview()` runs from a user gesture.
  - Keeps desktop mic-meter auto-start behavior so Run 1 desktop lobby behavior is unchanged.
  - Keeps the AudioContext alive across lobby reacquires after activation, avoiding post-gesture AudioContext recreation during device changes.
  - Adds optional `facingMode` to `preflight()` and `reacquire()`.
  - Records `lastVideoConstraints` with `facingMode` for Playwright assertions.
- `frontend/src/app/components/lobby-preview/*`
  - Adds a mobile-only `Flip camera` icon button inside the video preview.
  - Shows a `Tap to enable mic preview` pill when the mic analyzer is not activated.
  - Emits `enableMicPreview` and `flipCamera` actions to the room page.
  - Changes mobile device selectors to a single-column stack with 48px select targets.
- `frontend/src/app/pages/room/room.page.*`
  - Tracks `currentFacingMode`.
  - Wires the lobby flip button to toggle `user`/`environment` and reacquire media.
  - Passes mobile `facingMode` into lobby preflight/reacquire.
  - Exposes `audioContextActivated` and `currentFacingMode` in `__meetDebug`.
- `e2e/tests/v3-mb4-lobby/*`
  - Adds focused M-B4 live Playwright coverage for camera switch, desktop absence, selector stacking, and AudioContext gesture gating.

## FacingMode Handling

| Context | Constraint behavior |
|---|---|
| Mobile camera on | Adds `{ facingMode: 'user' | 'environment' }` plus 480p caps |
| Mobile flip | Toggles `currentFacingMode`, reacquires stream, updates `lastVideoConstraints.video.facingMode` |
| Mobile deviceId + facingMode | `facingMode` takes precedence; `deviceId` is omitted to avoid browser conflicts |
| Desktop | Existing 1280x720 ideal path remains; flip button not rendered |

## AudioContext Gate Strategy

The gate applies to mobile viewports. Mobile lobby starts with `audioContextActivated === false`, shows the pill, and keeps meter level at zero. The pill click calls `MediaService.activateMicPreview()` directly in the click path, creates/resumes the AudioContext, then starts the 8 Hz analyzer. Desktop auto-starts the analyzer to preserve Run 1 behavior.

## Screenshots

- `screenshots/mobile-lobby-with-pill.png`
- `screenshots/mobile-lobby-after-tap.png`
- `screenshots/mobile-camera-switch-button.png`
- `screenshots/desktop-lobby-no-switch.png`
- `screenshots/mobile-selectors-single-column.png`

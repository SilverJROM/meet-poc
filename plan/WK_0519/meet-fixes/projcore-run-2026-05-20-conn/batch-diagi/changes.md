# Batch DIAGI Changes

## Scope
- branch: fix/meet-conn-diag
- batch: DIAGI, DR-25

## Files Changed
- `frontend/src/app/services/media.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/app/components/device-dialog/device-dialog.component.ts`
- `frontend/src/app/components/device-dialog/device-dialog.component.html`
- `frontend/src/app/components/device-dialog/device-dialog.component.scss`
- `e2e/tests/v3-diagi-device-switch/device-switch.spec.ts`

## What Changed
- Added selected audio/video device IDs to lobby preflight so persisted or picker-selected devices are used from the first acquired stream.
- Made camera selection mutually exclusive: exact picker `deviceId` wins, while mobile front/back flip clears the pinned camera and sends `facingMode`.
- Applied the same exact-device/facing-mode rule to lobby reacquire, in-call camera replace, and control-bar camera toggle.
- Added a mobile flip button to the reused device dialog so in-call mobile front/back switching is available from device settings.
- Kept mic swaps on `webrtc.replaceLocalSenderTrack('audio', ...)`, preserving DR-13 audio-priority reassertion.
- Added DIAGI Playwright coverage for lobby and in-call picker swaps, exact constraints, mobile flip constraints, and audio sender priority after mic swap.

## Root Cause
- The picker change handlers were wired and in-call `replaceTrack` existed.
- The first lobby preflight ignored `selectedAudioId` and `selectedVideoId`, so initial media used browser defaults.
- On mobile, room code always passed `facingMode`, and `MediaService` intentionally suppressed `deviceId` when `facingMode` was present. That made picker-selected cameras lose to front/back constraints.

## Self-Verification
- `npm test -w backend`: PASS, 114 passed / 1 skipped
- `npm run build`: PASS
- `npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --types node,@playwright/test e2e/tests/v3-diagi-device-switch/device-switch.spec.ts`: PASS

## Deferred By Freeze
- Playwright/e2e execution: DEFERRED by deploy freeze.
- Live pm2 restart/deploy: DEFERRED by deploy freeze.
- Screenshot `screenshots/device-switch.png`: DEFERRED until Playwright can run after freeze.

## Caveats
- Real multi-camera/mobile front-back hardware confirmation remains JROM's device proof, as fake browser media can verify constraints and track replacement but not physical camera hardware.


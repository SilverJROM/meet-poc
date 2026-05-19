# Batch FIXC2 Changes

## Source
JROM verbatim from `og-requirements.md`: "lets have a mini modal test screen where user can test their camera, mic and speakers..." and "have the users able to test out their device settings before entering, and also even in the middle of the call..."

## Scope
- Branch: `fix/meet-fixc2-device-modal`
- Requirements: R-C-1 and R-C-2 only.
- Base branch: `fix/meet-fixc1-camera-light`.

## Files Changed
- `frontend/src/app/components/device-dialog/device-dialog.component.ts`
- `frontend/src/app/components/device-dialog/device-dialog.component.html`
- `frontend/src/app/components/device-dialog/device-dialog.component.scss`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/app/pages/room/room.page.scss`
- `frontend/src/app/components/controls-bar/controls-bar.component.ts`
- `frontend/src/app/components/controls-bar/controls-bar.component.html`
- `frontend/src/app/services/media.service.ts`
- `frontend/src/app/services/webrtc.service.ts`
- `frontend/src/app/app.routes.ts`
- `e2e/playwright.live.config.ts`
- `e2e/tests/v3-fixc2-device-modal/device-modal.spec.ts`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc2/*`

## What Changed
- Added a reusable soft-light `DeviceDialogComponent` for lobby and in-call device setup.
- Added a styled pre-permission lobby step with a Continue action before `getUserMedia()`.
- Added camera preview, mic VU display, mic/camera/speaker dropdowns, and WebAudio speaker test tone.
- Persisted selected mic, camera, and speaker device IDs in localStorage for later joins.
- Added `/join/:id` as an alias for the existing room route.
- Added a gear icon to the in-call controls bar that opens the reused device dialog.
- Added in-call mic and camera replacement using fresh tracks plus `RTCRtpSender.replaceTrack()` across active peers.
- Added speaker-output application via `HTMLMediaElement.setSinkId()` when the browser supports it.
- Made the live Playwright config honor `E2E_BASE_URL` while preserving the localhost default.

## Self-Verification
- `npm run build -w backend`: PASS.
- `npm run build -w frontend`: PASS.
- `npm test -w backend`: PASS, 59/59.
- `npm test -w e2e -- tests/v3-fixc2-device-modal --config=playwright.live.config.ts --workers=1`: PASS, 4/4.
- Run 1 regression command with active fix specs: PASS, 49/49.
- `pm2 restart meet-poc-fe`: PASS, process online.
- `E2E_BASE_URL=https://voice.silverjrom.app npm test -w e2e -- tests/v3-fixc2-device-modal --config=playwright.live.config.ts --workers=1`: PASS, 4/4.
- Local smoke `curl -I http://localhost:4700`: PASS, HTTP 200.
- Local smoke `curl -i http://localhost:4700/api/me`: PASS, HTTP 200 with `{"user":null}`.

## Evidence
- Lobby screenshot: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc2/screenshots/lobby-modal.png`
- In-call screenshot: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc2/screenshots/in-call-dialog.png`

## Caveats
- Browser permission prompts cannot be replaced by app UI; the custom overlay prepares the user and then the browser still owns the OS-level Allow/Deny prompt.
- Speaker device switching uses `setSinkId`, which is Chrome-specific. Unsupported browsers keep the speaker dropdown disabled with explanatory title text.

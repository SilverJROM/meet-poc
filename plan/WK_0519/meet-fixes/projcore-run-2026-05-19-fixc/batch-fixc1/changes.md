# Batch FIXC1 Changes

## Source
JROM verbatim from `og-requirements.md`: "2nd when i joined the call my camera lights on, but after leaving the call its still lights-on can you fix that"

## Scope
- Branch: `fix/meet-fixc1-camera-light`
- Requirement: R-C-3 only.
- First commit: `a3b5b9a docs: seed projcore run C`
- Implementation commit: `6e305f6 fix(frontend): stop local media tracks on leave`

## Files Changed
- `frontend/src/app/services/media.service.ts`
- `frontend/src/app/services/webrtc.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc1/*`

## What Changed
- Local cleanup now stops camera, microphone, and screen-share tracks before peer connections close.
- WebRTC cleanup now walks local sender tracks and stops any sender-held track before closing connections.
- Room page now installs `pagehide` and `beforeunload` lifecycle cleanup hooks and removes them on destroy.
- Cleanup remains idempotent; repeated lifecycle events or destroy calls do not throw.
- Mute/camera-off controls still toggle `track.enabled`; they do not call `track.stop()`.

## Self-Verification
- `npm run build -w backend`: PASS.
- `npm run build -w frontend`: PASS.
- `npm test -w backend`: PASS, 59/59.
- `npm test -w e2e -- tests/v3-fixc1-camera-light --config=playwright.live.config.ts --workers=1`: PASS, 4/4.
- Run 1 regression command with active fix specs: PASS, 49/49.
- `pm2 restart meet-poc-fe meet-poc-be`: PASS.
- `pm2 status meet-poc-fe meet-poc-be`: both online.
- Public `https://voice.silverjrom.app/` smoke join/leave: PASS; disposable room cleaned afterward.

## Reproduction Notes
- Before: leave cleanup closed WebRTC peers before stopping local media, leaving sender-held tracks able to remain `live`.
- After: Playwright instrumentation records all acquired local tracks in `window.__activeTracks`; leave, `pagehide`, and repeated cleanup all reduce live-track count to 0.

## Caveats
- Hardware camera LED validation remains JROM's real-device confirmation because Playwright can only assert track lifecycle state.

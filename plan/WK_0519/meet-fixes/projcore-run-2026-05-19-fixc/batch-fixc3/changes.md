# Batch FIXC3 Changes

## Source
JROM verbatim from `og-requirements.md`: "when sharing the screen have the profiles of the users auto adjust and have a smaller form factor on the screen by being listed on the right side... vertical strip with a scroll, but have the ones speaking on top or sort of vibrate them..."

## Scope
- Branch: `fix/meet-fixc3-share-reflow`
- Requirement: R-C-4 only.
- Base branch: `fix/meet-fixc2-device-modal`.

## Files Changed
- `backend/src/modules/signaling/index.ts`
- `backend/tests/signaling-media-state.test.ts`
- `frontend/src/app/services/ws.service.ts`
- `frontend/src/app/services/webrtc.service.ts`
- `frontend/src/app/services/media.service.ts`
- `frontend/src/app/services/active-speaker.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/app/pages/room/room.page.scss`
- `frontend/src/app/components/tile/tile.component.ts`
- `frontend/src/app/components/tile/tile.component.html`
- `frontend/src/app/components/tile/tile.component.scss`
- `e2e/tests/v3-fixc3-share-reflow/share-reflow.spec.ts`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc3/*`

## What Changed
- Added `screenOn` to media-state signaling and frontend peer state so remote peers can identify the active screen sharer.
- Exposed the local screen stream for the main share canvas while preserving the local camera stream for the participant strip.
- Added share layout mode: main shared-screen stage plus right-side vertical participant strip.
- Added strip collapse toggle that expands the main share stage.
- Added strip ordering that promotes the active speaker and a subtle CSS pulse on the speaking strip tile.
- Added compact tile variants for strip and main shared-screen presentation.
- Added backend coverage for `screenOn` relay and legacy clients that omit the flag.
- Added FIXC3 Playwright coverage for share reflow, active speaker ordering, pulse state, collapse, return-to-grid, and 8-participant strip scrolling.

## Self-Verification
- `npm run build -w backend`: PASS.
- `npm run build -w frontend`: PASS.
- `npm test -w backend`: PASS, 60/60.
- `npm test -w e2e -- tests/v3-fixc3-share-reflow --config=playwright.live.config.ts --workers=1`: PASS, 2/2.
- Expanded Run 1 command including FIXC1, FIXC2, FIXC3, FIXB2, FIXB4, and v2 B3-B8: PASS, 55/55.
- `pm2 restart meet-poc-fe meet-poc-be`: PASS, both online.
- Public smoke: `E2E_BASE_URL=https://voice.silverjrom.app npm test -w e2e -- tests/v3-fixc3-share-reflow --config=playwright.live.config.ts --workers=1 --grep "FIXC3.1"`: PASS, 1/1.

## Evidence
- Share strip screenshot: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc3/screenshots/share-strip.png`
- Collapsed strip screenshot: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc3/screenshots/share-collapsed.png`

## Caveats
- The current WebRTC stack still publishes one video sender per peer. Remote sharers therefore publish screen video in place of camera video; the local sharer can still show local camera in the strip because the local camera stream is retained separately.

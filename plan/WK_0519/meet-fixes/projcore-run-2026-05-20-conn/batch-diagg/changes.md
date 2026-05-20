# Batch DIAGG Changes

## Scope
- branch: fix/meet-conn-diag
- batch: DIAGG, DR-17 and DR-20

## Files Changed
- `frontend/src/app/components/device-dialog/device-dialog.component.scss`
- `frontend/src/app/services/active-speaker.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `e2e/tests/v3-diagg-orientation-speaker/diagg-orientation-speaker.spec.ts`
- `e2e/tests/v3-fixc3-share-reflow/share-reflow.spec.ts`

## What Changed
- Removed the remaining `scaleX(-1)` video transform from the device dialog preview so all video surfaces render true orientation.
- Changed share-strip speaker promotion to use only the settled promoted speaker id, with a 5 second settle delay. The live `.is-speaking` class still follows the current active speaker immediately.
- Added a localhost-only active-speaker debug hook for deterministic order-settle regression tests.
- Added DIAGG e2e coverage for lobby preview, device dialog, local tile, and remote tile orientation, plus rapid speaker changes where highlight updates immediately but strip order waits.
- Updated the FIXC3 share-reflow regression to expect the new 5 second active-speaker order settle.

## Self-Verification
- `npm run build`: PASS
- `npm test -w backend`: PASS, 113 passed / 1 skipped
- DIAGG + FIXC3 targeted e2e on isolated DB: PASS, 4/4
- Clean Run-1 + diag gate on `/tmp/meet-diagg-gate.sqlite`: PASS, 93/93
- pm2 restarted through `ecosystem.config.js`; `pm2 env` for meet-poc processes has no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR`.

## Reproduction Notes
- Before: `app-device-dialog video` had `transform: scaleX(-1)`, and the share strip could reorder from active-speaker churn after the previous 500ms promotion delay.
- After: no `scaleX(-1)` / `rotateY(180deg)` video mirror CSS remains under `frontend/src/app`, and the strip order changes only after the 5 second settle window.

## Caveats
- JROM explicitly locked "no mirroring anywhere", so self-view is now true/un-mirrored. Most video apps mirror self-view; if that feels wrong on device, the reversible change is the single removed line in `device-dialog.component.scss`.
- The unfiltered 154-test Playwright superset was attempted and stopped after known legacy/non-gate failures appeared. The documented Run-1 + diag acceptance gate is the 93-test clean run above.

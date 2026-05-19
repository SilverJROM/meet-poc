# Batch FIXC3 Test Report

## Commands

| Check | Result |
|---|---|
| `npm run build -w backend` | PASS |
| `npm run build -w frontend` | PASS |
| `npm test -w backend` | PASS, 60/60 |
| `npm test -w e2e -- tests/v3-fixc3-share-reflow --config=playwright.live.config.ts --workers=1` | PASS, 2/2 |
| Expanded Run 1: `npm test -w e2e -- tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` | PASS, 55/55 |
| `pm2 restart meet-poc-fe meet-poc-be` | PASS |
| `pm2 status meet-poc-fe meet-poc-be` | PASS, both online |
| `E2E_BASE_URL=https://voice.silverjrom.app npm test -w e2e -- tests/v3-fixc3-share-reflow --config=playwright.live.config.ts --workers=1 --grep "FIXC3.1"` | PASS, 1/1 |

## Screenshots
- `screenshots/share-strip.png`
- `screenshots/share-collapsed.png`

## Notes
- Frontend build still prints the existing Ionic/Stencils empty-glob warning; the build succeeds.
- The public smoke skips localhost-only active-speaker injection but validates the live share, strip, collapse, and return-to-grid path.

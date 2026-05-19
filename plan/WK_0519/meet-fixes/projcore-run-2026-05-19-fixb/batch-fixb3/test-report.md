# FIX-B3 Test Report

## Build / Runtime

- `npm run build` — PASS
- `pm2 restart meet-poc-be meet-poc-fe` — PASS; both processes online after restart.

## Backend

- `npm test -w backend -- recording.test.ts` — PASS, 13/13 tests.
- `npm test -w backend` — PASS, 51/51 tests across 18 files.

## E2E

- `npm test -w e2e -- tests/v3-fixb3-recordings --config=playwright.live.config.ts --workers=1` — PASS, 1/1.
- Evidence screenshot: `batch-fixb3/screenshots/recordings-bulk-bar.png`.

## Run 1 Regression

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40.

## Notes

- First FIX-B3 e2e run exposed a test fixture filename shape mismatch; the fixture was corrected to use the existing parser-compatible six-hex suffix format. Product code did not need changes for that failure.

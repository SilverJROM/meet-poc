# FIX-B2 Test Report

## Build / Runtime

- `npm run build` — PASS.
- `pm2 restart meet-poc-be meet-poc-fe` — PASS; both processes online after restart.

## Backend

- `npm test -w backend -- recording.test.ts` — PASS, 16/16.
- `npm test -w backend` — PASS, 54/54 across 18 files.

## FIX-B2 E2E

- `npm test -w e2e -- tests/v3-fixb2-transcript --config=playwright.live.config.ts --workers=1` — PASS, 4/4.
- Evidence screenshot: `batch-fixb2/screenshots/recordings-with-meta-badge.png`.

## Run 1 Regression

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40.

## Notes

- Initial backend full-suite run found that adding `sessionId` to the legacy `admitted` WS message broke wire-format identity. That change was removed. The recorder now receives session id from the existing `recording-started` message, preserving legacy admitted shape.

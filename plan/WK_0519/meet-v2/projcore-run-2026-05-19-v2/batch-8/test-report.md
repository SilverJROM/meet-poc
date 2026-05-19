# v2-B8 Test Report

## Commands

- `npm run build -w frontend`
  - PASS: Angular production build after B8 wiring.
- `npm test -w e2e -- tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1`
  - PASS: 8 tests, 22.7s.
- `npm test -w backend`
  - PASS: 17 files, 43 tests.
- `npm run build`
  - PASS: backend TypeScript build + Angular production build.
- `npm test -w e2e -- tests/v2-b6-grid tests/v2-b7-controls --config=playwright.live.config.ts --workers=1`
  - PASS: 13 tests, 22.1s after helper update for the new sidebar selector.
- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1`
  - PASS: 40 tests, 1.1m.
- `pm2 restart meet-poc-fe`
  - PASS: frontend process restarted and online.
- Public live smoke against `https://voice.silverjrom.app`
  - PASS: created temp room, joined as host, opened participant sidebar, captured `screenshots/live-sidebar-host-open.png`, deleted temp room.

## Screenshots

- `screenshots/sidebar-host-open.png`
- `screenshots/sidebar-non-host-open.png`
- `screenshots/leave-dialog-visible.png`
- `screenshots/end-for-all-spinner.png`
- `screenshots/meeting-ended-toast.png`
- `screenshots/active-speaker-highlight.png`
- `screenshots/live-sidebar-host-open.png`

## Hygiene

- B8 test rooms/recordings use the `B8SIDE` prefix and are cleaned by the B8 suite.
- The public `B8LIVE` room was deleted through the authenticated API after screenshot capture.
- Older B3/B4/B6/B7 screenshots refreshed during regression were restored and not committed as B8 changes.

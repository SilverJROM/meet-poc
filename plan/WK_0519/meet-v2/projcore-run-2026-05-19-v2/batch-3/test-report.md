# v2-B3 Test Report

## Commands

- `npm run build -w frontend`
  - PASS: Angular production build.
- `npm test -w backend`
  - PASS: 16 files, 39 tests.
- `npm run build`
  - PASS: backend TypeScript build and frontend Angular build.
- `pm2 restart meet-poc-fe`
  - PASS: `meet-poc-fe` restarted and online.
- `npx playwright test tests/v2-b3-shell --config=playwright.live.config.ts`
  - PASS: 8 tests, 2.1s.
- Public smoke against `https://voice.silverjrom.app`
  - PASS: login as seeded user lands on `https://voice.silverjrom.app/app/rooms` and renders the Rooms heading.

## Playwright Coverage

| Spec | Coverage |
|---|---|
| `redirect.spec.ts` | root-to-rooms and `/dashboard` compatibility redirect |
| `sidebar.spec.ts` | six sidebar tabs, active route state, route clicks, collapsed default, persisted expanded state |
| `stubs.spec.ts` | Transcripts and Settings Run 2 placeholders |
| `auth-guard.spec.ts` | parent `/app` auth guard for multiple child routes |

## Screenshots

- `screenshots/app-rooms-sidebar-collapsed.png`
- `screenshots/app-rooms-sidebar-open.png`
- `screenshots/app-transcripts-stub.png`
- `screenshots/app-settings-stub.png`

## Regression Notes

- The first attempt to run through the default e2e webserver path collided with the existing PM2 backend on port 4720. The B3 UI suite was rerun through `playwright.live.config.ts` against the already-running PM2 stack and passed.
- A one-off public smoke using stale example credentials failed with 401. The smoke was rerun with the seeded project credential from `INITIAL_PASSWORD.txt` and passed.

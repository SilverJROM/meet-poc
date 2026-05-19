# v2-B4 Test Report

## Commands

- `npm test -w backend`
  - PASS: 16 files, 42 tests.
- `npm run build -w frontend`
  - PASS: Angular production build.
- `npm run build -w backend`
  - PASS: TypeScript build.
- `npx playwright test tests/v2-b4-tabs --config=playwright.live.config.ts`
  - PASS after test-isolation fixes: 5 tests, 11.7s.
- `npx playwright test tests/v2-b3-shell --config=playwright.live.config.ts`
  - PASS: 8 tests, 1.9s.
- `npm run build`
  - PASS: backend and frontend builds.
- `pm2 restart meet-poc-be meet-poc-fe`
  - PASS: both services online.
- Public smoke against `https://voice.silverjrom.app`
  - PASS: `/app/rooms`, `/app/ongoing`, `/app/past`, `/app/recordings` render under the app shell.

## Playwright Notes

The first two B4 Playwright runs exposed concurrent test-data interference in the room-list specs. The product behavior was intact; the specs were adjusted so direct DB seeds and UI-created rooms remain visible when Playwright runs B4 files in parallel.

## Hygiene

After the final B4 and B3 runs:

- Rooms: only pre-existing `TEST_ROOM01` remained.
- `meeting_sessions`: 0 rows.
- `recordings/`: no test recordings remained.

## Screenshots

- `screenshots/app-rooms-page-1.png`
- `screenshots/app-rooms-page-2.png`
- `screenshots/app-ongoing-empty.png`
- `screenshots/app-ongoing-populated.png`
- `screenshots/app-past-populated.png`
- `screenshots/app-recordings.png`

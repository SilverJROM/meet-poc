# v2-B5 Test Report

## Commands

- `npm run build -w frontend`
  - PASS: Angular production build.
- `npx playwright test tests/v2-b5-lobby --config=playwright.live.config.ts`
  - PASS after timing fix: 6 tests, 2.1s.
- `npm test -w backend`
  - PASS: 16 files, 42 tests.
- `npx playwright test tests/v2-b3-shell --config=playwright.live.config.ts`
  - PASS: 8 tests, 3.0s.
- `npx playwright test tests/v2-b4-tabs --config=playwright.live.config.ts`
  - PASS: 5 tests, 12.4s.
- `npm run build`
  - PASS: backend and frontend builds.
- `pm2 restart meet-poc-fe`
  - PASS: frontend process online after final build.
- Public smoke against `https://voice.silverjrom.app/room/3f324d8be763`
  - PASS: lobby preview rendered and `__meetDebug.localStream` had an audio track.

## Targeted Coverage

| Spec | Coverage |
|---|---|
| `lobby-preflight.spec.ts` | Pre-grant on lobby mount + camera-off screenshot |
| `lobby-mic-meter.spec.ts` | At least one active mic meter bar |
| `lobby-device-selector.spec.ts` | Microphone selector has at least one option |
| `lobby-permission-denied.spec.ts` | Denied state copy + Retry button |
| `lobby-camera-preview.spec.ts` | Camera-on preview screenshot |
| `lobby-stream-carries.spec.ts` | Track IDs match before lobby Join and after in-call transition |

## Hygiene

After B5 validation:

- Rooms: only pre-existing `TEST_ROOM01` remained.
- `meeting_sessions`: 0 rows after removing the short smoke-generated `host-disconnect-empty` row.
- `recordings/`: no test recordings remained.

## Screenshots

- `screenshots/lobby-camera-off-preview.png`
- `screenshots/lobby-camera-on-preview.png`
- `screenshots/lobby-permission-denied.png`

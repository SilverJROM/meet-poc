# DR-46 Test Report

## Build

- `npm run build -w frontend` — PASS.

## Browser

All Playwright runs used isolated `/tmp` SQLite DBs, isolated `/tmp` recordings directories, and isolated `48xx` ports.

- `MEET_DB_PATH=/tmp/meet-dr46-e2e.sqlite MEET_RECORDINGS_DIR=/tmp/meet-dr46-recordings E2E_BACKEND_PORT=4831 E2E_FRONTEND_PORT=4832 E2E_PROXY_PORT=4830 E2E_BASE_URL=http://localhost:4830 E2E_WS_ORIGIN=ws://localhost:4830 npm test -w e2e -- tests/v3-diagi-device-switch/device-switch.spec.ts -g DR-46` — PASS, 1/1.
- `MEET_DB_PATH=/tmp/meet-dr46-diagi.sqlite MEET_RECORDINGS_DIR=/tmp/meet-dr46-diagi-recordings E2E_BACKEND_PORT=4834 E2E_FRONTEND_PORT=4835 E2E_PROXY_PORT=4833 E2E_BASE_URL=http://localhost:4833 E2E_WS_ORIGIN=ws://localhost:4833 npm test -w e2e -- tests/v3-diagi-device-switch/device-switch.spec.ts` — PASS, 3/3.

## Covered Evidence

- Mic `ended` with selected device gone recovers to fallback mic.
- Outbound sender audio priority remains high after recovery.
- Transient `mute` followed by `unmute` does not replace the mic track.
- Camera `ended` recovers to fallback camera when one is available.
- Camera `ended` with no camera available settles to no local video track and `effectiveCameraOn=false`.
- "refresh to rejoin" is absent from the recovery path.

## Env Hygiene

- `/tmp` DBs and `/tmp` recordings dirs were used for e2e.
- E2E ports used: `4830`, `4831`, `4832`, `4833`, `4834`, `4835`.
- TEST_ROOM01 was not touched.

# Batch mobile-rx-video Test Report

## Build

PASS:
```bash
npm run build -w backend
npm run build -w frontend
```

Frontend build emitted the existing Stencil empty-glob warning; bundle generation completed.

## Backend Signaling

PASS:
```bash
npm test -w backend -- signaling-media-state.test.ts signaling-wire-format.test.ts signaling-knock-admit.test.ts signaling-reconnect.test.ts signaling-mobile-cap.test.ts
```

Result:
- 5 test files passed.
- 20 tests passed.

Coverage:
- `isMobile` propagates in peer presence and media-state.
- Existing admit/reconnect/wire-format/mobile-cap paths remain compatible.

## E2E

PASS with `/tmp` DB/recordings and isolated 48xx ports:
```bash
MEET_DB_PATH=/tmp/meet-poc-mobile-rx-video.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-mobile-rx-video-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/v3-mobile-rx-video/mobile-rx-video.spec.ts
```

Result:
- 1 test passed.

Coverage:
- Desktop sender degrades video toward a mobile receiver in 1:1 at 120kbps / scale 4 / 8fps.
- Audio sender remains active.
- Under mobile receive strain, a non-active-speaker sender pauses video only.
- Active-speaker video remains unpaused.
- Paused non-speaker video restores after sustained-good samples.

## DR-42 Regression

PASS with `/tmp` DB/recordings and isolated 48xx ports:
```bash
MEET_DB_PATH=/tmp/meet-poc-mobile-rx-video-dr42.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-mobile-rx-video-dr42-recordings E2E_BACKEND_PORT=4821 E2E_FRONTEND_PORT=4812 E2E_PROXY_PORT=4813 E2E_BASE_URL=http://localhost:4813 E2E_WS_ORIGIN=ws://localhost:4813 npm test -w e2e -- e2e/tests/v3-diagc-weak-connection/diagc-weak-connection.spec.ts
```

Result:
- 1 test passed.

## Deploy Verification

PASS:
```bash
pm2 delete meet-poc-be meet-poc-fe
pm2 start ecosystem.config.js --only meet-poc-be,meet-poc-fe
pm2 save
curl -fsS -I http://localhost:4700/
curl -fsS http://localhost:4700/
curl -fsS http://localhost:4720/api/ice-config
pm2 env 48
pm2 env 49
```

Evidence:
- `meet-poc-be` and `meet-poc-fe` online after clean restart.
- Frontend served HTTP 200 and rebuilt `main-3O47LDII.js`.
- Backend `/api/ice-config` responded.
- Env leak check emitted no `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, or E2E `48xx` variables for the pm2 apps.

## TEST_ROOM01

PASS by scope. Tests used isolated `/tmp` DBs and did not mutate `TEST_ROOM01`.

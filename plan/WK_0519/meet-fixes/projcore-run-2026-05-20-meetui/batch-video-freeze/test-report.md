# DR-47 Test Report

Commands:
- `npm run build -w frontend` — PASS.
- `MEET_DB_PATH=/tmp/meet-dr47.sqlite MEET_RECORDINGS_DIR=/tmp/meet-dr47-recordings E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- v3-video-freeze/video-freeze.spec.ts` — PASS, 3/3.
- `npm run build` — PASS.
- `pm2 restart ecosystem.config.js --only meet-poc-be,meet-poc-fe --update-env` — PASS.
- `curl -I http://localhost:4700/login` — PASS, HTTP 200.
- `(pm2 env 50; pm2 env 51) | rg 'MEET_DB_PATH|MEET_RECORDINGS_DIR' || true` — PASS, no leaked test env.

Evidence:
- `screenshots/video-frozen-recovery.png`
- `screenshots/no-inbound-media-recovery.png`
- `screenshots/camera-off-excluded.png`

Environment hygiene:
- E2E used isolated 48xx ports.
- E2E used `/tmp/meet-dr47.sqlite` and `/tmp/meet-dr47-recordings`.
- No isolated 48xx webserver processes remained after Playwright shutdown.
- pm2 production env has no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR` leak.
- `TEST_ROOM01` was not touched.

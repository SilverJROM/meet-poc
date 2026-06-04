# B16 Test Report

## Passed

- `npx tsc --noEmit --pretty false -p frontend/tsconfig.app.json`
- `npx tsx frontend/src/app/services/ice-config.spec.ts`
- `npx tsx frontend/src/app/services/sfu-client.spec.ts`
- `npx tsx frontend/src/app/services/remote-audio-health.spec.ts`
- `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts`
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`
- `npx tsx frontend/src/app/services/media-acquisition.spec.ts`
- `npx vitest run backend/tests/ice-config.test.ts` (14 passed)
- `npm run build` (backend build + frontend Angular build passed)
- `pm2 restart meet-poc-fe meet-poc-be` (both online)
- `curl http://127.0.0.1:4720/health` -> `{"ok":true}`
- `curl http://127.0.0.1:4720/api/ice-config/health` -> TURN configured true, has TURN servers true, source `cloudflare`

## Warnings

- Angular build still reports existing warnings: unused `DatePipe`, Stencil empty glob, and CommonJS Mediapipe optimization warning.
- `remote-audio.service.spec.ts` intentionally logs a bad sink fallback warning while passing.

## Full Backend Suite

- `npm test -w backend` failed with unrelated existing failures:
  - `auth-login.test.ts` and `migrate-from-json.test.ts` expect older login response shape.
  - `rooms.test.ts` expects older slug/public-exists response shape.
  - `sessions-ttl.test.ts` expects older `/api/me` null response shape.
  - `signaling-waiting-room.test.ts` timed out waiting for a websocket message.
- B16 touched backend module coverage (`backend/tests/ice-config.test.ts`) is green.

## Restrictive-Network Proof

Not proven in automated tests. Corporate firewall / UDP-blocked NAT validation remains JROM's real network seat.

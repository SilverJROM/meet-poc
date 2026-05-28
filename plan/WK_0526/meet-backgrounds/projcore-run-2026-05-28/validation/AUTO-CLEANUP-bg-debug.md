# AUTO-CLEANUP bg-debug Validation

## Removed
- Removed `BG-DEBUG` backend route wiring from `backend/src/server.ts`.
- Deleted `backend/src/modules/bg-debug/`.
- Deleted `frontend/src/app/services/bg-debug.service.ts`.
- Removed `BgDebugService` imports/injections, counters, state resets, and log calls from `background-effects.service.ts`, `room.page.ts`, and `lobby-preview.component.ts`.
- Deleted `logs/bg-debug.jsonl`.
- Cleared stale PM2 `BG_DEBUG_ENABLED` from `meet-poc-be`.

## Preserved
- All five ask commits remain on branch history: `094147e`, `6ff4df4`, `04c452a`, `bee02e3`, `726227c`.
- Preserved MediaPipe bundled asset loading and `NgZone.runOutsideAngular` wrapping.
- Preserved `scripts/serve.js` MIME map.
- Preserved background picker failure handling and lobby "Background" collapse toggle.
- Preserved room page `ion-icon` replacements for the Stencil bug.

## Verification
- PASS: `npm run build -w backend`
- PASS: `npm run build -w frontend`
- PASS: `E2E_BASE_URL=http://localhost:4713 E2E_BACKEND_PORT=4721 E2E_FRONTEND_PORT=4712 E2E_PROXY_PORT=4713 npm test -w e2e -- e2e/tests/fixloop-banner e2e/tests/background-host-self-view.spec.ts e2e/tests/background-picker-draggable.spec.ts e2e/tests/v3-mb3-call-layout/controls-and-grid.spec.ts e2e/tests/auto5-host-handoff/host-handoff.spec.ts --reporter=line` (`32 passed`)
- PASS: `curl -X POST http://localhost:4700/api/bg-debug/log -d '{}'` returned `404`.
- PASS: `pm2 env meet-poc-be` equivalent (`pm2 env 74`) shows no `BG_DEBUG_ENABLED`.
- PASS: `pm2 restart meet-poc-be` and `pm2 restart meet-poc-fe`; both processes online.

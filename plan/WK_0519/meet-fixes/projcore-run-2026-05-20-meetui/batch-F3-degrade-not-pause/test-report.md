# Batch F3 Test Report

## Commands
- `npx tsc -p frontend/tsconfig.spec.json --outDir /tmp/meet-f3-spec` — PASS
- `node /tmp/meet-f3-spec/webrtc-video-policy.spec.js` — PASS
- `npm run build -w frontend` — PASS
- `pm2 delete meet-poc-be meet-poc-fe` — PASS
- `pm2 start ecosystem.config.js` — PASS, `meet-poc-be` and `meet-poc-fe` online with 0 restarts.
- `curl -I --max-time 10 http://127.0.0.1:4700/` — PASS, HTTP 200.
- `curl -sS --max-time 10 http://127.0.0.1:4700/api/ice-config` — PASS, JSON returned.
- `pm2 env 56 | rg 'MEET_DB_PATH|MEET_RECORDINGS_DIR|E2E_BASE_URL|E2E_BACKEND_PORT|E2E_FRONTEND_PORT|E2E_PROXY_PORT' || true` — PASS, no output.
- `pm2 env 57 | rg 'MEET_DB_PATH|MEET_RECORDINGS_DIR|E2E_BASE_URL|E2E_BACKEND_PORT|E2E_FRONTEND_PORT|E2E_PROXY_PORT' || true` — PASS, no output.

## Assertions Covered
- Marginal connected relay floor decides `degrade`.
- Truly dead expected-video zero-packet floor decides `pause`.
- Sustained `weak` quality restores a degraded peer.
- Frontend build accepts the WebRTC sender `degradationPreference` wiring and the new helper import.

## Env Hygiene
- No `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, or E2E port variables leaked into the restarted PM2 services.
- `TEST_ROOM01` was not touched.

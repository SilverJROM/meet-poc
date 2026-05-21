# Batch F2 Renegotiate Test Report

## Commands
- `npm run build -w frontend` — PASS.
- `npm run build` — PASS.
- `npm test -w e2e -- --list tests/v3-renegotiate/renegotiate.spec.ts` — PASS, listed 2 tests.
- `MEET_DB_PATH=/tmp/meet-dr55-renegotiate.sqlite MEET_RECORDINGS_DIR=/tmp/meet-dr55-renegotiate-recordings E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-renegotiate/renegotiate.spec.ts --workers=1` — PASS, 2/2.
- `pm2 delete meet-poc-be meet-poc-fe` — PASS.
- `pm2 start ecosystem.config.js` — PASS, `meet-poc-be` and `meet-poc-fe` online with 0 restarts.
- `curl -I -s http://localhost:4700` — PASS, 200.
- `curl -I -s http://localhost:4720/api/ice-config` — PASS, 200.
- `pm2 env 54 | rg 'MEET_DB_PATH|MEET_RECORDINGS_DIR|E2E_BASE_URL|E2E_BACKEND_PORT|E2E_FRONTEND_PORT|E2E_PROXY_PORT' || true` — PASS, no output.
- `pm2 env 55 | rg 'MEET_DB_PATH|MEET_RECORDINGS_DIR|E2E_BASE_URL|E2E_BACKEND_PORT|E2E_FRONTEND_PORT|E2E_PROXY_PORT' || true` — PASS, no output.

## E2E Coverage
- `DR-55 camera-off sender later sends camera and screen frames over the pre-negotiated video sender` — PASS.
  - Sender joined camera-off.
  - Before camera-on, sender snapshot showed the stored null-track video sender had video preferences: `videoPriority=low`, `videoNetworkPriority=low`, `videoMaxBitrate=700000`, `videoScaleResolutionDownBy=1`, `videoMaxFramerate=30`.
  - After camera-on, receiver inbound video had a live video receiver and `framesDecoded > 0`, `bytesReceived > 0`.
  - After screen-share, receiver decoded additional frames over the video path.
- `DR-55 camera-on at join still negotiates video and decodes frames` — PASS.

## Screenshots
- `screenshots/receiver-camera-after-audio-only-join.png`
- `screenshots/receiver-screen-after-audio-only-join.png`

## Environment Hygiene
- E2E used `/tmp/meet-dr55-renegotiate.sqlite`, `/tmp/meet-dr55-renegotiate-recordings`, and isolated ports `4810`, `4811`, `4820`.
- `TEST_ROOM01` was not touched.
- Isolated ports were clear after Playwright shutdown.
- PM2 env-leak verification passed for both live apps.

# Batch audiofix test report

Environment:
- DB: `/tmp/meet-poc-audiofix.sqlite`
- Ports: proxy `4810`, frontend `4811`, backend `4820`
- WS origin: `ws://localhost:4810`

Commands:
- `npm run build -w frontend` — PASS
- `npm run build -w backend` — PASS
- `npm run build` — PASS
- `MEET_DB_PATH=/tmp/meet-poc-audiofix.sqlite npm run seed -w backend` — PASS
- `MEET_DB_PATH=/tmp/meet-poc-audiofix.sqlite E2E_BASE_URL=http://localhost:4810 E2E_PROXY_PORT=4810 E2E_FRONTEND_PORT=4811 E2E_BACKEND_PORT=4820 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-audiofix/audiofix.spec.ts` — PASS
- `pm2 restart meet-poc-be meet-poc-fe` — PASS
- `pm2 env 40 | rg 'MEET_DB_PATH|MEET_RECORDINGS_DIR|NODE_ENV|PORT'` — PASS, no test DB/recording env leaked
- `pm2 env 41 | rg 'MEET_DB_PATH|MEET_RECORDINGS_DIR|NODE_ENV|PORT'` — PASS, no test DB/recording env leaked

E2E coverage:
- Remote peer camera on: visible remote video exists and is muted.
- Remote peer camera off: avatar is shown and the dedicated remote audio element persists.
- Dedicated audio: unmuted, playing, has one audio track, and debug confirms `audio.srcObject === peer.stream`.
- Camera on/off/on/off: audio sink remains attached and playing.

Iteration notes:
- Initial test assertion used `audio.playsInline`; Chromium returned `undefined`, so the test now asserts the `playsinline` attribute.
- The test caught that the static muted attribute did not reliably set `HTMLVideoElement.muted`; the component now also binds and force-sets `video.muted = true`.

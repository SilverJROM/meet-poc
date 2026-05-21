# Batch TURN-TLS443 Test Report

Commands:
- `npm test -w backend -- tests/ice-config.test.ts` — PASS, 9/9.
- `npm run build -w backend` — PASS.
- `npm run build` — PASS; Angular emitted the existing Stencil empty-glob warning.
- `npm test -w backend` — PASS, 123/123 passed, 1 skipped.
- `pm2 restart meet-poc-be meet-poc-fe --update-env` — PASS.
- `pm2 env 40 | rg "^(name|PORT|NODE_ENV|MEET_DB_PATH|MEET_RECORDINGS_DIR):"` — PASS; backend env shows `PORT=4720`, `NODE_ENV=development`, and no `MEET_DB_PATH` / `MEET_RECORDINGS_DIR`.
- `pm2 env 41 | rg "^(name|PORT|NODE_ENV|MEET_DB_PATH|MEET_RECORDINGS_DIR|BACKEND_ORIGIN|FRONTEND_ORIGIN):"` — PASS; frontend env shows expected ports/origins and no `MEET_DB_PATH` / `MEET_RECORDINGS_DIR`.
- `pm2 status meet-poc-be meet-poc-fe` — PASS; both apps online.

Coverage:
- Mocked Cloudflare fetch returns the live `/credentials/generate` shape without TLS 443 and verifies the returned Cloudflare entry includes derived `turns:turn.cloudflare.com:443?transport=tcp` with the same username/credential.
- Verifies STUN plus existing Cloudflare UDP/TCP/5349 entries are retained.
- Verifies already-present TLS 443 is not duplicated.
- Verifies malformed TURN URLs do not break config and are not used to derive a fallback.
- Verifies plain `turn:` URLs never produce TLS 443.
- Verifies static TURN env is honored and incomplete static env is ignored gracefully.

Evidence:
- pm2 restart clean; no test DB or recordings env leaked into live pm2.

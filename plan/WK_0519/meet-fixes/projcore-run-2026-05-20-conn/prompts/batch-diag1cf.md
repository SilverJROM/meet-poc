Batch-DIAG1CF: Complete the Cloudflare TURN mint integration (completes DR-5's deferred seam)

Batch ID: diag1cf
Branch: continue on fix/meet-conn-diag (same branch as Batch A 5a41110)
Requirement: DR-5 Cloudflare path (the seam you intentionally stubbed pending JROM's key)

This is a COMPLETION of already-approved DR-5 work — the Cloudflare credential-mint was stubbed at dispatch because JROM hadn't provided the key. JROM has now provided it. No new PROPOSED handshake needed; implement directly per this precise spec, COMMIT BEFORE STATUS: DONE, append `[projcore callback] diag1cf DONE <note>` to the run callbacks.md.

## Credentials (already in /home/agjrom/websites/meet-poc/.env — gitignored, do NOT commit or echo values)

JROM used these EXACT variable names — read them verbatim:
- `TURN_ID` = the Cloudflare TURN **key ID** (goes in the mint URL path)
- `TURN_API_Key` = the Cloudflare **API token** (goes in the Authorization: Bearer header)

Your current stub reads `CLOUDFLARE_TURN_SERVICE_ID` / `CLOUDFLARE_TURN_TOKEN` — those won't match. **Read `TURN_ID` and `TURN_API_Key`** (keep the existing aliases as fallbacks if you like, but JROM's names must work). Backend reads from process.env (the app should load .env — verify dotenv is loaded at backend boot; if not, add it).

## Cloudflare TURN mint API (exact)

- `POST https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_ID}/credentials/generate`
- Header: `Authorization: Bearer ${TURN_API_Key}`, `Content-Type: application/json`
- Body: `{ "ttl": 86400 }`  (seconds; 24h. Max allowed 172800 = 48h.)
- Response shape:
  ```json
  { "iceServers": { "urls": ["stun:stun.cloudflare.com:3478","turn:turn.cloudflare.com:3478?transport=udp","turn:turn.cloudflare.com:3478?transport=tcp","turns:turn.cloudflare.com:5349?transport=tcp"], "username": "<minted>", "credential": "<minted>" } }
  ```
  Note: Cloudflare returns a SINGLE iceServers OBJECT (urls is an array, one username/credential). Normalize into OUR array shape so the frontend's `iceServers: IceServerConfig[]` consumes it — e.g. push `{ urls: <array>, username, credential }` (RTCIceServer accepts a urls array) OR expand per-url. Either is valid; keep it simple.

## Requirements

1. In `getIceServersFromEnv()` Cloudflare branch: when `TURN_ID` + `TURN_API_Key` present, call the mint endpoint, parse `iceServers`, merge with the STUN entries, return.
2. **Cache** the minted credentials in-memory until shortly before expiry (e.g. cache for `ttl - 300s`); re-mint on demand after. Minting on every `/api/ice-config` request is wasteful + rate-limited. A module-level cache keyed by nothing (single key set) is fine.
3. **Never crash**: on mint failure (non-2xx, network error, malformed body), `console.warn` with the status + fall back to STUN-only (+ static TURN if also configured). `/api/ice-config` must always return 200 with at least STUN.
4. Keep STUN-only default when neither static nor Cloudflare env is set (no regression — existing test must still pass).
5. Do NOT log the minted username/credential or the API token.

## Tests

- Backend test (`backend/tests/ice-config.test.ts` — extend it): mock global `fetch` to return the Cloudflare response shape when `TURN_ID`+`TURN_API_Key` set → assert `/api/ice-config` returns the minted TURN entries merged with STUN. Add a failure case: fetch rejects/500 → falls back to STUN-only, no throw. Keep the existing STUN-only + static-TURN tests green.
- Do NOT hit the real Cloudflare API in tests (mock fetch).

## Verify (you, before DONE)

- `npm test -w backend` PASS (98+ now).
- `npm run build -w backend` PASS.
- `pm2 restart meet-poc-be`.
- **Live mint check** (real creds, this is the proof the wiring works): `curl -s http://localhost:4720/api/ice-config` (or via the FE proxy) → response now includes `turn:`/`turns:` Cloudflare entries with a minted username/credential. Paste the URLS ONLY (not the credential) into your test-report as evidence the mint succeeded.
- Run-1 regression must still pass (69-spec set incl. tests/v3-diag1-conn). STUN-only default test must still pass.

## Artifacts

Append to batch-diag1/ (or a short batch-diag1cf note): test-report.md update with the mint-success evidence (urls only), changes.md note. Decision log only if you made a non-trivial autonomous call.

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` AND append `[projcore callback] diag1cf DONE <note>` to plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/callbacks.md as the final action.

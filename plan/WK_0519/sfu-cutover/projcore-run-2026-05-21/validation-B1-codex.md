# Validation: B1 SR-1 Backend Cloudflare Realtime Proxy

Validator: Codex independent validator  
Batch: B1  
Commit: `59c0122` (`feat(sfu): add backend Cloudflare Realtime proxy module (SR-1)`)  
Requirement: `SR-1` from `plan/WK_0519/sfu-cutover/og-requirements.md`

## Verdict

VALIDATED-PASS

## SR-1 Checks

- CF endpoint coverage: PASS
  - `backend/src/modules/realtime-sfu/index.ts` wraps the six required Cloudflare Realtime endpoints:
    - `POST /sessions/new` via `POST /api/sfu/session`
    - `POST /sessions/{id}/tracks/new` via `POST /api/sfu/tracks`
    - `PUT /sessions/{id}/tracks/update` via `PUT /api/sfu/tracks/update`
    - `PUT /sessions/{id}/renegotiate` via `PUT /api/sfu/renegotiate`
    - `PUT /sessions/{id}/tracks/close` via `PUT /api/sfu/tracks/close`
    - `GET /sessions/{id}` via `GET /api/sfu/session/:cfSessionId`
- Cloudflare base URL and server-side Bearer secret: PASS
  - Base is `https://rtc.live.cloudflare.com/v1/apps/{SFU_APP_ID}`.
  - `SFU_APP_ID` and `SFU_TOKEN` are read server-side only.
  - CF fetch uses `Authorization: Bearer ${token}` server-side.
- Secret leak check: PASS
  - Static review found no response path returning the `SFU_TOKEN` value.
  - Session creation returns only `{ sessionId }`.
  - CF success/error responses are forwarded without adding request credentials.
  - Targeted test asserts response JSON does not contain `SFU_TOKEN`.
- Authz / admitted membership: PASS
  - All `/api/sfu/*` routes require `clientKey`, `participantId`, and app meeting `sessionId`.
  - Routes reuse `isAdmittedDiagnosticPoster(...)` before CF calls.
- Session ownership: PASS
  - CF session ownership is recorded when `/api/sfu/session` succeeds.
  - All CF-session routes require ownership and return `403` for foreign/unknown `cfSessionId`.
- CF 4xx/5xx passthrough: PASS
  - Non-OK CF status is returned as the HTTP response status with `{ error, status }`.
  - Error text is sourced from CF `errorDescription` or `error` when present.
- Missing credentials: PASS
  - All routes return `503` with `SFU not configured` when `SFU_APP_ID` or `SFU_TOKEN` is missing.

## Scope Check

PASS. `git diff --name-status 59c0122^ 59c0122` shows only:

- `backend/src/modules/realtime-sfu/index.ts` added
- `backend/src/server.ts` modified for SFU router import/use wiring only
- `backend/tests/realtime-sfu.test.ts` added
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/B1/changes.md` added
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md` updated

No unrelated source or logic changes were found.

## Test Evidence

- `npm run build` from `backend/`: PASS (`tsc -p tsconfig.json`, exit 0)
- `npm test -- realtime-sfu.test.ts` from `backend/`: PASS
  - Test files: 1 passed
  - Tests: 3 passed
  - Covered smoke CF session creation, token absence, CF 4xx passthrough, unadmitted 403, and foreign session 403.

## Notes

- The implementation uses a process-local ownership map for B1. That satisfies this batch's ownership gate for sessions created through the proxy; reconnect/persistence behavior is left to later SFU batches.
- `server.ts` has two added lines: import plus `app.use('/api', realtimeSfuRouter())`. This is the expected route wiring change and contains no additional business logic.

STATUS: VALIDATED-PASS

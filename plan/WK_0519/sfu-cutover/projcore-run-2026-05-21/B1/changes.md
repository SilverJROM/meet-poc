# B1 changes — SR-1: Backend Cloudflare Realtime proxy module

## What changed

**New: `backend/src/modules/realtime-sfu/index.ts`**
- `getCfCredentials()` — reads `SFU_APP_ID` + `SFU_TOKEN` from env; returns null if either missing → routes return 503
- `cfFetch()` — generic fetch helper; sets `Authorization: Bearer <token>`, Content-Type; returns `{ ok, status, data }`
- `sanitizeCfError()` — extracts CF `errorDescription` or `error` field; never returns the token string
- `sessionOwners` Map — process-local `cfSessionId → { clientKey, participantId }`; ephemeral (reconnect re-establishes in B7); comment notes process-local scope
- `clearSfuSessionOwnersForTests()` — exported cleanup for tests
- `realtimeSfuRouter()` — Express Router with 6 routes:
  - `POST /api/sfu/session` → `POST /sessions/new`; stores ownership on success; returns `{ sessionId }`
  - `POST /api/sfu/tracks` → `POST /sessions/{id}/tracks/new`
  - `PUT /api/sfu/tracks/update` → `PUT /sessions/{id}/tracks/update`
  - `PUT /api/sfu/renegotiate` → `PUT /sessions/{id}/renegotiate`
  - `PUT /api/sfu/tracks/close` → `PUT /sessions/{id}/tracks/close`
  - `GET /api/sfu/session/:cfSessionId` → `GET /sessions/{id}`
- Auth: all routes check admitted membership via `isAdmittedDiagnosticPoster` (DR-41 gate, same as diagnostics; requires `clientKey + participantId + sessionId` in request body/query). Non-create routes additionally check `sessionOwners` for resource ownership → 403 on foreign session.
- Proxy strips `clientKey`, `participantId`, `sessionId`, `cfSessionId` before forwarding to CF (no identity fields leak to CF).
- CF 4xx/5xx: passes through `{ error: <CF errorDescription>, status: <CF status> }` — token never in any response.
- Network error on fetch (unreachable): 502 with `"CF unreachable: <message> — check SFU_APP_ID/SFU_TOKEN and network"`.

**Modified: `backend/src/server.ts`**
- Added import of `realtimeSfuRouter`
- Added `app.use('/api', realtimeSfuRouter())` alongside other module routers

**New: `backend/tests/realtime-sfu.test.ts`**
- B1-1 smoke: real CF session created via `POST /api/sfu/session` with admitted owner → `sessionId` is a non-empty string, `SFU_TOKEN` absent from response
- B1-2 CF 4xx passthrough: `fetch` stubbed to return `{ errorDescription: 'test-cf-error' }` → response is `{ error: 'test-cf-error', status: 400 }`, token absent
- B1-3 authz: unadmitted caller → 403; admitted caller with unowned cfSessionId → 403
- Uses `loadEnv({ path: '../.env' })` (explicit path) since `backend/` is the test CWD and `.env` is at project root

## Why

SR-1: frontend SFU client (B2+) needs a server-side proxy to call the Cloudflare Realtime API with the App Secret (`SFU_TOKEN`). The secret must never reach the browser. The proxy also enforces that only admitted room members can create CF sessions and that participants can't mutate each other's sessions.

## Build + test result

- `npm run build` — clean (0 errors)
- `realtime-sfu.test.ts` — 3/3 pass (B1-1 real CF call: 999ms, session created successfully)

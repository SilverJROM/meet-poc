# meet-poc — project specs

**Repo:** `/home/agjrom/websites/meet-poc`
**Live URL:** `https://voice.silverjrom.app` (CF Tunnel → consolidated local port)
**Status:** v2 Run 1 in progress — locked at 2026-05-19. See `plan/WK_0519/meet-v2/og-requirements.md` for the v2 contract.

> Purpose: this file is the source of architectural truth for the rebuilt app. It is updated as decisions are locked. Anything in `og-requirements.md` is the contract; this file is the surrounding context (stack, conventions, tooling, deploy/rollback).

---

## 1. Stack

**Frontend:**
- Angular 20+ standalone components, signals, RxJS
- Ionic + Ionicons (matches `~/websites/lokalcamp/frontend/` patterns visually)
- REST via Angular `HttpClient` (no Apollo — autonomous /projcore call 2026-05-19, see JROM/decisions)
- Per-feature pages under `frontend/src/app/pages/<name>/`
- Shared components under `frontend/src/app/components/`
- Services under `frontend/src/app/services/`
- Routes in `frontend/src/app/app.routes.ts`

**Backend:**
- Node + TypeScript + Express + `ws` (WebSocket)
- `better-sqlite3` for persistence (replaces legacy `data.json`)
- Session-cookie auth (HttpOnly, Secure on HTTPS, SameSite=Lax, 30-day TTL); password hashed via scrypt (carrying the legacy PoC format) or bcrypt — locked in B1
- `tsx` for dev (`tsx watch src/server.ts`); `tsc` to `dist/` for prod
- Per-module split under `backend/src/modules/<name>/` (auth, rooms, signaling, sessions, recording)
- SQLite migrations under `backend/migrations/NNNN_<name>.sql` — idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`)

**TURN:**
- Deferred by JROM on 2026-05-19 B6 cutover. Current ICE config is STUN-only.
- Future coturn work should add TURN entries through the frontend environment ICE config.

**Process management:**
- PM2 ecosystem.config.js — two apps: `meet-poc-be` and `meet-poc-fe`
- Consolidated proxy via `scripts/serve.js` (similar to lokalcamp): `/api/*` + `/ws` + `/upload` → backend; everything else → Angular dev server (dev) or `frontend/dist/` (prod)

## 2. Directory layout (post-rebuild)

```
meet-poc/
├── backend/
│   ├── src/
│   │   ├── server.ts                  ← entry: starts http + ws + serves
│   │   ├── db.ts                      ← better-sqlite3 init + migration runner
│   │   ├── modules/
│   │   │   ├── auth/                  ← login/me/logout, hashing, sessions
│   │   │   ├── rooms/                 ← CRUD routes
│   │   │   ├── signaling/             ← ws handlers (join/admit/reject/signal)
│   │   │   ├── sessions/              ← meeting session DB helpers + listing API
│   │   │   └── recording/             ← /upload route + on-disk persistence
│   │   └── lib/                       ← shared utils (cookies, errors, types)
│   ├── migrations/
│   │   └── 0001_init.sql
│   ├── tests/                         ← vitest unit/integration tests
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/app/
│   │   ├── pages/
│   │   │   ├── login/
│   │   │   ├── app-shell/             ← authenticated /app parent shell
│   │   │   ├── rooms/                 ← create-room form + room list
│   │   │   ├── recordings/            ← recordings list/download
│   │   │   ├── ongoing-stub/          ← B4 placeholder
│   │   │   ├── past-stub/             ← B4 placeholder
│   │   │   ├── transcripts-stub/      ← Run 2 placeholder
│   │   │   ├── settings-stub/         ← Run 2 placeholder
│   │   │   └── room/                  ← lobby + call
│   │   ├── services/
│   │   ├── components/
│   │   ├── app.routes.ts
│   │   ├── app.config.ts
│   │   └── main.ts
│   ├── package.json
│   ├── angular.json
│   └── tsconfig.json
├── e2e/
│   ├── playwright.config.ts
│   ├── tests/
│   │   ├── b1-backend-auth/
│   │   ├── b2-rooms-signaling/
│   │   ├── b3-shell-auth/
│   │   ├── b4-call-ui/
│   │   ├── b5-recording/
│   │   └── b6-cutover/
│   └── fixtures/
├── scripts/
│   ├── serve.js                       ← consolidated proxy
│   ├── seed.ts                        ← seed jrom@silverjrom.app from INITIAL_PASSWORD.txt
│   └── migrate-from-json.ts           ← one-time data.json → SQLite migration
├── recordings/                        ← (gitignored) saved .webm
├── data/                              ← (gitignored) SQLite file lives here
├── plan/
│   └── WK_0519/meet-rebuild/          ← og-requirements, scenarios, impl-plan, projcore-run
├── ecosystem.config.js                ← PM2 (meet-poc-be + meet-poc-fe)
├── package.json                       ← root npm workspaces
└── INITIAL_PASSWORD.txt               ← (gitignored) bootstrap seed
```

Legacy files were moved to `legacy-poc/` during B1 and deleted during B6 per JROM directive. Legacy source remains available in git history.

## 3. Auth

- Single seeded user `jrom@silverjrom.app`. No multi-user, no invites (out of scope).
- Session cookie name `session`, HttpOnly, SameSite=Lax, Secure when `x-forwarded-proto=https`.
- 30-day TTL, refreshed on each `GET /api/me`.
- Failed-login logging includes IP + masked email; success logs full email + IP.
- Password storage format: `<saltHex>:<scryptHashHex>` (legacy) OR bcrypt `$2a$…` — implementer picks one in B1 and documents.

## 4. Data conventions

- **IDs:** room IDs are `crypto.randomBytes(6).toString('hex')` → 12-hex string. User IDs are emails (lowercase).
- **Timestamps:** stored as INTEGER milliseconds in SQLite (Date.now()), surfaced as ISO-8601 in API responses.
- **Booleans:** stored as INTEGER 0/1.
- **Soft delete:** not used (rooms hard-delete is the model).

## 5. Module boundaries

| Module | Exposed | Allowed deps |
|--------|---------|--------------|
| auth | login/me/logout routes, `assertSession(req)` middleware | `db`, `lib/cookies` |
| rooms | CRUD routes, `getRoom(id)` helper | `db`, `auth.assertSession` |
| signaling | `/ws` endpoint, knock/admit protocol | `db`, `auth` (cookie parse), `rooms.getRoom`, `sessions` lifecycle helpers |
| sessions | meeting session store + `/api/meeting-sessions` route | `db`, `auth.requireAuth` |
| recording | authenticated `/upload` route, recordings list/download | `db`, `auth.requireAuth`, `rooms`, `sessions.getOpenSessionFor` |

## 5.1 Meeting wire protocol

Existing v1 messages remain supported: `join`, `signal`, `admit`, `reject`, `admitted`, `knocking`, `knock`, `pending-list`, `peer-joined`, `peer-left`, `knock-cancelled`, `signal`, `rejected`, `error`.

v2 backend host-authority messages:
- Client to server: `recording-state {state:'started'|'stopped'}`, `meeting-ended-by-host`, `mute-target {clientId}`, `remove-peer {clientId}`.
- Server to clients: `recording-started {clientId, sessionId}`, `recording-stopped {clientId, sessionId}`, `meeting-ended {reason}`, `mute-request {from}`, `peer-removed {reason}`.
- Host commands are validated server-side against room ownership. Non-host commands are no-ops with info-level stdout logging.

## 5.2 Recording persistence

`POST /upload` requires a valid session cookie, room ownership, and an open `meeting_session` for the room. New recording filenames embed the session id:

`<ISO-ts>_<sessionId>_<roomId>_<roomTitleSlug>_<rand6>.webm`

The recording parser remains backward-compatible with v1 files:

`<ISO-ts>_<roomId>_<roomTitleSlug>_<rand6>.webm`

A cross-module import must be one of the above; otherwise it's a Gate-7 standing-rule check fail.

## 6. UI conventions

- Density-light (per `JROM/style/priorities.md` and `~/.claude/agents/ui-standards.md`).
- Dark theme baseline (matches current PoC and lokalcamp).
- All panel transitions via **Angular Router**, NOT `hidden` attribute toggling (the bug that caused the stitching).
- Show-password toggle, recording indicator, knock spinner are reusable components under `frontend/src/app/components/`.

### 6.1 v2 App Shell

- Authenticated dashboard surface is now under `/app/*`.
- `/dashboard` is a compatibility redirect to `/app/rooms`.
- `/app` is guarded once at the parent route; child pages inherit the auth guard.
- Left sidebar is persistent across `/app/*`, collapsed by default, and remembers user preference in `localStorage` key `meet-poc.sidebar-collapsed`.
- Sidebar tabs, in order: Rooms, Ongoing meetings, Past meetings, Recordings, Transcripts, Settings.
- `/app/rooms` owns the former dashboard create-room form and room list.
- `/app/recordings` owns the former dashboard recordings list.
- `/app/ongoing` and `/app/past` are B4 stubs; `/app/transcripts` and `/app/settings` are Run 2 stubs.

## 7. Testing expectations

- **E2E:** Playwright via `e2e/playwright.config.ts`. baseURL = consolidated dev URL (TBD in B1, likely 4710). Headless chromium with fake-media-stream flags for WebRTC.
- **Per-batch:** scenarios in `plan/WK_0519/meet-rebuild/scenarios.md` (this run); per-batch test-report under `projcore-run-2026-05-19/validation/batch-<n>.md`.
- **Backend unit:** vitest under `backend/tests/`.
- **No `page.setContent` static-HTML smell** allowed (§2.10).
- **Per-module first** (§2.10a); full e2e is sanity check only.
- **Targeted run example:** `npx playwright test e2e/tests/b3-shell-auth/ --config=e2e/playwright.config.ts`

## 8. Deployment

### 8.1 Local development
```bash
# One-time setup
cd /home/agjrom/websites/meet-poc
npm install --workspaces
cd backend && npm run migrate && npm run seed && cd ..

# Start
pm2 start ecosystem.config.js
pm2 logs meet-poc-be
pm2 logs meet-poc-fe
```

Dev URLs:
- **Consolidated live:** `http://localhost:4700` — proxy
- Backend direct: `http://localhost:4720`
- Angular dev server direct, only when running separately: `http://localhost:4711`

### 8.2 Environments

| Env | URL | Backend | Notes |
|-----|-----|---------|-------|
| Local | http://localhost:4700 | PM2 `meet-poc-be` + `meet-poc-fe` | |
| DEV | https://voice.silverjrom.app | (proxied via CF Tunnel → localhost:4710) | **CURRENT** deploy mechanism |
| QA / PROD | — | — | not configured; out of scope |

### 8.3 Deploy commands (DEV = restart PM2)

```bash
# After pulling new code
cd /home/agjrom/websites/meet-poc
npm install --workspaces
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..
pm2 restart meet-poc-be
pm2 restart meet-poc-fe
```

### 8.4 CF Tunnel

The named CF Tunnel routes `voice.silverjrom.app` → `http://localhost:4700` (consolidated proxy). The tunnel is token-based and the hostname mapping is managed in Cloudflare Zero Trust, not a local `~/.cloudflared/config.yml` file.

### 8.5 Rollback (R10.3)

The legacy single-file PoC was deleted during B6 per JROM directive. There is no supported live rollback path after cutover; recover legacy source from git history if ever needed. See `ROLLBACK.md`.

The `recordings/` directory was preserved at cutover.

### 8.6 Gate protocol (per-batch)

1. Branch clean (`git status`)
2. Backend type check (`cd backend && npm run build`)
3. Frontend type check (`cd frontend && ng build`)
4. SQLite migrations applied
5. PM2 restart (`pm2 restart meet-poc-be meet-poc-fe`)
6. Targeted Playwright run for the batch
7. Independent validator (/projcore) opens consolidated dev URL + verifies scenarios

## 9. Known gotchas

- **getUserMedia HTTPS requirement:** browsers refuse mic/camera over plain HTTP unless on localhost. Always test via `http://localhost:4710` or via the CF Tunnel HTTPS URL.
- **CF Tunnel + WebSocket upgrade:** `cloudflared` natively supports WS upgrade; no special config needed.
- **WebRTC + symmetric NAT:** STUN alone fails; coturn TURN handles fallback (R7).
- **SQLite write concurrency:** better-sqlite3 is synchronous — fine for single-process Node, but means long queries block the event loop. Keep queries small.
- **Wire format identity:** B2 must preserve the legacy WS message shapes verbatim so legacy `client.js` could still connect during cutover (we won't use that capability, but it's a smoke-test safety net).

## 10. Open questions for JROM

| # | Question | Lead's default | Decided in batch |
|---|----------|----------------|-------------------|
| Q-PS-1 | Final consolidated port number? | 4710 | B1 |
| Q-PS-2 | Bcrypt or scrypt? | scrypt (carries legacy hash format → migration easier) | B1 |
| Q-PS-3 | Move legacy code to `legacy-poc/` or git history only? | `legacy-poc/` until B6 verified, then delete | B1 |
| Q-PS-4 | coturn auth: static credentials or shared secret (TURN REST API)? | static — simpler, single-tenant | B6 |
| Q-PS-5 | Hardening protocol adopted? | NOT yet — same as lokalcamp (no `plan/hardening/`) | — |

## 11. Module surface (live)

Filled in as batches close. Empty at run start.

| Module | Owner | Touched in | Status |
|--------|-------|------------|--------|
| backend/auth | — | B1 | PENDING |
| backend/rooms | — | B2 | PENDING |
| backend/signaling | — | B2 | PENDING |
| backend/recording | — | B5 | PENDING |
| frontend/login page | — | B3 | PENDING |
| frontend/app shell | Codex | v2-B3 | DONE |
| frontend/rooms page | Codex | v2-B3 | DONE |
| frontend/recordings page | Codex | v2-B3 | DONE |
| frontend/ongoing/past stubs | Codex | v2-B3 | DONE |
| frontend/transcripts/settings stubs | Codex | v2-B3 | DONE |
| frontend/room page (lobby) | — | B4 | PENDING |
| frontend/room page (call) | — | B4 | PENDING |
| infra/coturn | — | B6 | PENDING |

## 12. Changelog (rule changes)

- **2026-05-19:** bootstrap — locked from /projcore intake conversation. Stack: Angular 20 FE + TS Node BE + better-sqlite3 + coturn. REST chosen over GraphQL (autonomous /projcore call). Single user. Room cap 8 (warning at 6). Repo rewrite in place.

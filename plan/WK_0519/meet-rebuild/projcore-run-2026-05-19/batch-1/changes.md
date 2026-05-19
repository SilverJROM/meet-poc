# Batch 1 Changes — Backend Foundation

## User Report Verbatim

> JROM screenshot evidence: login card visible at top of viewport, scroll down -> dashboard topbar ("meet-poc" + Logout) + "Create a room" card also visible. Both panels rendered simultaneously after login. That is the "weird stitched" symptom.

> Batch B1 — Backend foundation: Auth login/me/logout, password hashing, session TTL, seeded user, login logging, PM2 `meet-poc-be` entry, and `data.json` -> SQLite migration.

## Root Cause

The stitched UI is a legacy prototype symptom, but B1 is not the UI fix. The mechanism closed here is foundational: the old app kept auth users and sessions in `data.json` inside a single Express file, so the rebuild needed a TypeScript backend boundary, SQLite persistence, compatible password verification, compatible session cookies, and a migration path before rooms, signaling, and Angular can be added safely.

B1 preserves the legacy app under `legacy-poc/` while adding a sibling backend on port 4720. The new auth module stores users and sessions in SQLite, keeps the legacy scrypt hash format, preserves login log strings, deletes expired sessions on read, and imports the existing `data.json` user/session state when SQLite is empty or when the explicit migration script is run.

## Code Changes

- `.gitignore` — added new generated locations: `data/`, `backend/dist/`, and `backend/node_modules/`.
- `legacy-poc/data.json` — moved from root as the legacy migration source.
- `legacy-poc/package.json` — moved from root to preserve the legacy runtime package.
- `legacy-poc/package-lock.json` — moved with the legacy package metadata.
- `legacy-poc/public/client.js` — moved legacy vanilla WebRTC client unchanged.
- `legacy-poc/public/index.html` — moved legacy markup unchanged.
- `legacy-poc/public/style.css` — moved legacy styles unchanged.
- `legacy-poc/seed.js` — moved legacy seeder unchanged.
- `legacy-poc/server.js` — moved legacy server; adjusted recordings path to keep using root `recordings/` after the move.
- `package.json` — added root workspaces with backend delegation scripts.
- `package-lock.json` — generated workspace lockfile for backend dependencies.
- `backend/package.json` — added Express, ws, better-sqlite3, cookie, TypeScript, tsx, Vitest, and Supertest.
- `backend/tsconfig.json` — strict NodeNext TypeScript build config targeting ES2022.
- `backend/vitest.config.ts` — node Vitest config with serial file execution for isolated SQLite tests.
- `backend/migrations/0001_init.sql` — creates `users`, `sessions`, indexes, and migration tracking input.
- `backend/src/db.ts` — SQLite initialization, data directory creation, migration runner, DB lifecycle helpers.
- `backend/src/lib/cookies.ts` — legacy-compatible cookie parse and session cookie serialization.
- `backend/src/lib/passwords.ts` — legacy-compatible scrypt hash and verify helpers.
- `backend/src/modules/auth/index.ts` — `/api/login`, `/api/logout`, `/api/me` router with legacy response/log behavior.
- `backend/src/modules/auth/sessions.ts` — SQLite-backed session create/read/delete with 30-day TTL and expired cleanup.
- `backend/src/server.ts` — Express app entry, `/health`, placeholder `/ws` echo endpoint, startup migrations, first-boot JSON migration, port 4720 default.
- `backend/scripts/seed.ts` — idempotent seed of `jrom@silverjrom.app` from root `INITIAL_PASSWORD.txt` without logging the password.
- `backend/scripts/migrate-from-json.ts` — idempotent legacy `data.json` users/sessions import.
- `backend/tests/helpers.ts` — per-test temporary SQLite DB and initial-password reader for tests only.
- `backend/tests/auth-login.test.ts` — S1.1/S1.2 API and log coverage.
- `backend/tests/auth-me-logout.test.ts` — S1.3/S1.4 API coverage.
- `backend/tests/passwords.test.ts` — S1.5 DB/hash coverage.
- `backend/tests/sessions-ttl.test.ts` — S1.6 expired-session cleanup coverage.
- `backend/tests/migrate-from-json.test.ts` — S1.7 migration plus login compatibility coverage.
- `ecosystem.config.js` — keeps legacy `meet-poc` entry on port 4700 and adds `meet-poc-be` on port 4720.

## Autonomous Decisions

- Did not commit or print `INITIAL_PASSWORD.txt`; tests and seed read it locally only. This preserves the batch requirement to read it without logging plaintext credentials.
- Adjusted `legacy-poc/server.js` recording path to `../recordings` so moving the legacy server does not redirect future legacy recordings into `legacy-poc/recordings`.

## Modules Touched + Cross-Module Imports

- `backend/auth` imports `db`, `lib/cookies`, `lib/passwords`, and its local `sessions` module.
- `backend/server` imports `auth`, `db`, and `scripts/migrate-from-json` for first boot only.
- `backend/scripts` import `db` and `lib/passwords`.
- No frontend, rooms, signaling protocol, or recording module implementation was added.

## Caveats / Things To Revisit

- `/ws` is intentionally an echo placeholder; B2 owns the real room signaling protocol.
- `meet-poc-fe` and consolidated port 4710 are deferred to B3 per the B1 brief.
- `npm install` reported 5 moderate vulnerabilities in transitive dependencies; not remediated in B1 because that would be outside scope.

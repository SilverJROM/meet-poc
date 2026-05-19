# Batch 3 Changes — Angular Shell + Auth + Dashboard

## User Report Verbatim

> Batch B3 — Angular shell + auth + dashboard
>
> Requirements assigned: R4.1, R4.2 B3 slice, R4.3, R4.4, R4.5, R4.8, R8.1 FE half, R8.2, R8.5 FE half, R9.1, R9.2, R9.4.
>
> Critical: S3.5 stitched-symptom-absent test must assert `.toHaveCount(0)` on login form selectors in the DOM after auth.

## Root Cause

The legacy app rendered multiple panels in one static document and hid them via the `hidden` attribute, which failed when a higher-specificity CSS rule forced auth panels to `display:flex`. B3 removes that failure mode for the login/dashboard slice by introducing an Angular standalone SPA where route components are mounted and unmounted through the router, not CSS panel toggles.

The frontend now authenticates through the B1 `/api/login|me|logout` routes and manages rooms through the B2 `/api/rooms` routes, all via the consolidated port `4710`.

## Code Changes

- `frontend/` — new Angular 20 standalone workspace with dark theme, router, signals, HttpClient services, login page, dashboard page, and minimal room placeholder.
- `frontend/src/app/services/auth.service.ts` — signal-backed user state, session check, login, logout.
- `frontend/src/app/services/rooms.service.ts` — REST room list/create/delete/exists helpers.
- `frontend/src/app/guards/*.ts` — `/dashboard` auth guard and `/login` no-auth guard.
- `frontend/src/app/pages/login/*` — email/password form, show-password toggle, inline errors.
- `frontend/src/app/pages/dashboard/*` — topbar, create-room form, rooms list, copy-link, join/delete actions, recordings placeholder.
- `frontend/src/app/pages/room-placeholder/*` — minimal `/room/:id` placeholder for deleted-room verification only; B4 still owns lobby/call.
- `scripts/serve.js` — consolidated proxy on port `4710`; `/api`, `/ws`, `/upload` to backend `4720`; other routes to Angular dev server `4711` or static dist in production.
- `scripts/e2e-webserver.js` — Playwright webserver wrapper that starts backend, Angular dev server, and proxy together.
- `e2e/` — Playwright workspace and S3.1-S3.8 real-DOM tests.
- `ecosystem.config.js` — adds `meet-poc-fe` PM2 entry running `scripts/serve.js`.
- `package.json` / `package-lock.json` — root workspaces now include `backend`, `frontend`, `e2e`; added root `http-proxy`.
- `.gitignore` — added Angular/e2e generated outputs.

## Ports

- Backend direct: `4720`
- Angular dev server: `4711`
- Consolidated frontend/proxy: `4710`

## Autonomous Decisions

- `decisions/2026-05-19-b3-proxy-and-webserver.md`
- `decisions/2026-05-19-b3-room-placeholder.md`
- `decisions/2026-05-19-b3-angular-cdk-version.md`

## Modules Touched + Cross-Module Imports

- Frontend services call REST only through `HttpClient`; no Apollo/GraphQL packages were added.
- Frontend routes use standalone lazy-loaded page components.
- Backend source was not changed in B3.
- E2E fixture reads `INITIAL_PASSWORD.txt` locally but never logs its content.

## Caveats / Things To Revisit

- `meet-poc-fe` runs only the consolidated proxy. Angular dev server is started by `npm run dev:frontend` or the Playwright wrapper; this is documented in the decision file.
- The `/room/:id` page is a placeholder only. B4 replaces it with lobby/call behavior.
- `npm install` still reports 5 moderate vulnerabilities in transitive dependencies; not remediated in B3.
- Playwright Chromium had to be installed locally via `npx playwright install chromium`.

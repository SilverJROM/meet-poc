# v2-B3 Changes

## User Report

Invoke `$lead` for v2-B3. Frontend-only app shell refactor: move the authenticated dashboard surface to `/app/*`, add a persistent collapsible sidebar with six tabs, keep `/dashboard` as a redirect to `/app/rooms`, guard `/app/**`, rebuild, restart `meet-poc-fe`, and commit before `STATUS: DONE`.

## Root Cause Mechanism

The v1 rebuilt frontend had one authenticated dashboard route that mixed room creation, room listing, and recording listing in one page. v2 needs a persistent navigation shell before later batches add paginated Rooms/Ongoing/Past/Recordings views and meeting-side controls. The shell also keeps the router-based panel model that fixed the original stitched-login/dashboard symptom.

## Code Changes

- `frontend/src/app/app.routes.ts`
  - Added `/app` parent route guarded by `authGuard`.
  - Added children for Rooms, Ongoing, Past, Recordings, Transcripts, and Settings.
  - Redirected `/` and `/dashboard` to `/app/rooms`.
- `frontend/src/app/pages/app-shell/*`
  - Added the authenticated app shell with left sidebar, sticky topbar, active route state, user email, and logout.
  - Sidebar defaults collapsed and persists preference in `localStorage` key `meet-poc.sidebar-collapsed`.
- `frontend/src/app/pages/rooms/*`
  - Migrated create-room form and room list from the old dashboard.
- `frontend/src/app/pages/recordings/*`
  - Migrated recordings list/download from the old dashboard.
- `frontend/src/app/pages/ongoing-stub/*`
  - Added B4 placeholder.
- `frontend/src/app/pages/past-stub/*`
  - Added B4 placeholder.
- `frontend/src/app/pages/transcripts-stub/*`
  - Added Run 2 placeholder.
- `frontend/src/app/pages/settings-stub/*`
  - Added Run 2 placeholder.
- `frontend/src/app/pages/dashboard/*`
  - Deleted after migration.
- `frontend/src/app/pages/login/login.page.ts`, `frontend/src/app/guards/no-auth.guard.ts`, `frontend/src/app/pages/room/*`
  - Updated post-login, logged-in-login redirect, and room leave/back links to `/app/rooms`.
- `e2e/tests/v2-b3-shell/*`
  - Added B3 route, sidebar, stub, and auth-guard coverage.
- Existing B3/B4/B5 Playwright expectations and auth fixture now target `/app/rooms`.
- `project_specs.md`
  - Documented the v2 app shell and live frontend module surface.

## Sidebar Contents

| Order | Label | Route | Icon |
|---:|---|---|---|
| 1 | Rooms | `/app/rooms` | `videocam-outline` |
| 2 | Ongoing meetings | `/app/ongoing` | `radio-outline` |
| 3 | Past meetings | `/app/past` | `time-outline` |
| 4 | Recordings | `/app/recordings` | `recording-outline` |
| 5 | Transcripts | `/app/transcripts` | `document-text-outline` |
| 6 | Settings | `/app/settings` | `settings-outline` |

## Route Table

| Route | Behavior |
|---|---|
| `/` | Redirects to `/app/rooms` |
| `/dashboard` | Redirects to `/app/rooms` |
| `/login` | Login page; `noAuthGuard` redirects logged-in users to `/app/rooms` |
| `/app` | Auth-guarded parent shell; redirects to `/app/rooms` |
| `/app/rooms` | Rooms page with create-room form and room list |
| `/app/ongoing` | B4 stub |
| `/app/past` | B4 stub |
| `/app/recordings` | Recordings list/download page |
| `/app/transcripts` | Run 2 stub |
| `/app/settings` | Run 2 stub |
| `/room/:id` | Existing room lobby/call route; left unwrapped by app shell |
| `**` | Redirects to `/app/rooms` |

## Modules Touched

- Frontend routing
- Frontend authenticated shell
- Frontend rooms/recordings/stub pages
- Playwright e2e specs and fixtures
- Project architecture docs

## Caveats

- Rooms and Recordings remain unpaginated in B3 by scope; B4 owns pagination and Ongoing/Past real content.
- Transcripts and Settings are stubs only; Run 2 owns real content.
- `/room/:id`, recording, backend, and signaling behavior were not changed except existing internal links returning to `/app/rooms`.

## Autonomous Decisions

- Logged `decisions/2026-05-19-v2-b3-sidebar-persistence-key.md`: persist sidebar preference under `meet-poc.sidebar-collapsed`.
- Logged `decisions/2026-05-19-v2-b3-shell-logout-placement.md`: place logout in the shell topbar so it remains available from every `/app/*` child route.
- Logged `decisions/2026-05-19-v2-b3-live-playwright-config.md`: use the live Playwright config for B3 validation because the default e2e webserver attempted to bind a backend port already owned by the PM2 live backend.

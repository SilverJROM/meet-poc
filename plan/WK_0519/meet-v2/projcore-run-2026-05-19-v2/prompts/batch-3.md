# Batch v2-B3 — Frontend: app shell refactor

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** v2-B3
**Branch:** `feat/meet-v2-b3-app-shell` — off the B2 HEAD.

**Requirements assigned (verbatim from og-requirements.md):**
- **R3.1** — `/app/{rooms,ongoing,past,recordings,transcripts,settings}` routes + Transcripts/Settings stubs
- **R3.2** — `/dashboard` redirects to `/app/rooms`
- **R3.3** — Persistent collapsible left sidebar + topbar + active state highlighting; density-light dark theme
- **R3.4** — Auth guard at `/app/**` (parent guard, not per-page)

Read before coding:
- `og-requirements.md` (R3 section)
- `scenarios.md` (S3.1-S3.4)
- `context-handoff.md` (post-B2 state)

---

## Expected (acceptance criteria)

### Step 1 — App shell component

Create `frontend/src/app/pages/app-shell/app-shell.component.{ts,html,scss}`:

- **Layout:** CSS grid with two columns: sidebar (collapsible, ~240px when open, ~64px when collapsed showing icons only) + main area (flex 1).
- **Sidebar contents (in order):**
  - Brand / logo at top (links to `/app/rooms`)
  - Nav list with `routerLink` + `routerLinkActive` + Ionic icons:
    - Rooms (`/app/rooms`) — videocam-outline
    - Ongoing meetings (`/app/ongoing`) — radio-outline
    - Past meetings (`/app/past`) — time-outline
    - Recordings (`/app/recordings`) — recording-outline
    - Transcripts (`/app/transcripts`) — document-text-outline
    - Settings (`/app/settings`) — settings-outline
  - Spacer (flex grow)
  - Collapse toggle button (chevron-back when open, chevron-forward when collapsed)
- **Topbar (inside main area, sticky):** breadcrumb / current page title + user email + Logout button
- **Active state:** `routerLinkActive` adds an `.is-active` class with a left-edge accent bar + slightly brighter bg. Use `aria-current="page"` for accessibility.
- **Collapsed state:** sidebar shows only icons (hide nav labels via CSS). Tooltip on hover shows the label.
- **Sidebar default state on first load:** collapsed (locked per og-requirements Q6). Remember user's preference via `localStorage` key `meet-poc.sidebar-collapsed` so subsequent loads honor the last choice.

### Step 2 — Routes refactor

Update `frontend/src/app/app.routes.ts`:

```typescript
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/rooms' },
  { path: 'dashboard', redirectTo: 'app/rooms' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage),
    canActivate: [noAuthGuard],
  },
  {
    path: 'app',
    loadComponent: () => import('./pages/app-shell/app-shell.component').then(m => m.AppShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'rooms' },
      { path: 'rooms', loadComponent: () => import('./pages/rooms/rooms.page').then(m => m.RoomsPage) },
      { path: 'ongoing', loadComponent: () => import('./pages/ongoing-stub/ongoing-stub.page').then(m => m.OngoingStubPage) },
      { path: 'past', loadComponent: () => import('./pages/past-stub/past-stub.page').then(m => m.PastStubPage) },
      { path: 'recordings', loadComponent: () => import('./pages/recordings/recordings.page').then(m => m.RecordingsPage) },
      { path: 'transcripts', loadComponent: () => import('./pages/transcripts-stub/transcripts-stub.page').then(m => m.TranscriptsStubPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings-stub/settings-stub.page').then(m => m.SettingsStubPage) },
    ],
  },
  {
    path: 'room/:id',
    loadComponent: () => import('./pages/room/room.page').then(m => m.RoomPage),
  },
  { path: '**', redirectTo: 'app/rooms' },
];
```

### Step 3 — Page split

Migrate the existing `dashboard.page` content:
- **Rooms (`/app/rooms`):** create-room form + room list. **No pagination yet** (B4 adds). **No tabs UI** — this page is just the rooms slice.
- **Recordings (`/app/recordings`):** the existing recordings section (filename + size + download). **No pagination yet** (B4 adds).
- **Ongoing stub (`/app/ongoing`):** "Ongoing meetings — populated by v2-B4. Coming soon."
- **Past stub (`/app/past`):** "Past meetings — populated by v2-B4. Coming soon."
- **Transcripts stub (`/app/transcripts`):** "Transcripts — coming in v2 Run 2."
- **Settings stub (`/app/settings`):** "Settings — coming in v2 Run 2."

Delete the old `dashboard.page` files after migration. Update any internal links (`routerLink="/dashboard"`) to `/app/rooms`.

### Step 4 — Auth guard moves to /app parent

Currently `authGuard` is on `/dashboard`. Move it to the `/app` parent route (per the routes block above) so all children are gated. Verify the existing `noAuthGuard` on `/login` still functions (logged-in user hitting `/login` redirects to `/app/rooms`).

### Step 5 — Tests `e2e/tests/v2-b3-shell/`

Playwright specs:
- `redirect.spec.ts` — S3.1 (dashboard → /app/rooms), S3.2 (`page.goto('/dashboard')` lands on `/app/rooms`)
- `sidebar.spec.ts` — S3.2: 6 nav items visible by label, "Rooms" has `aria-current="page"` when on `/app/rooms`; click each nav item, URL updates + correct page renders
- `stubs.spec.ts` — S3.3: navigate to `/app/transcripts` + `/app/settings`, each shows "coming" placeholder
- `auth-guard.spec.ts` — S3.4: `page.goto('/app/rooms')` without session → lands on `/login`; `page.goto('/app/ongoing')` without session → also lands on `/login`

Use the existing `e2e/fixtures/auth.ts` `loginAsJrom`.

**Hygiene:** if any test creates rooms or recordings, it must clean them up in `afterEach`. (For B3 you can mostly avoid creating rooms — the routing tests don't need them.)

### Step 6 — Rebuild + restart frontend

After all changes:
```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

Verify `https://voice.silverjrom.app/` redirects to `/app/rooms` and shows the new sidebar.

## Required artifacts

`projcore-run-2026-05-19-v2/batch-3/`:
1. `changes.md` (full template + sidebar contents table + route table)
2. `scenarios-implemented.md` (S3.1-S3.4)
3. `test-report.md` (backend regression 16/39 + B3 Playwright)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — at minimum: `/app/rooms` with sidebar OPEN, `/app/rooms` with sidebar COLLAPSED, `/app/transcripts` showing stub, `/app/settings` showing stub
7. **Decisions:** `decisions/2026-05-19-v2-b3-<slug>.md` for any non-trivial autonomous calls (Logout placement, exact icon choices, sidebar collapse width, localStorage key naming)

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** add pagination to Rooms or Recordings (B4).
- **DO NOT** wire Ongoing or Past tab content (B4 stubs only).
- **DO NOT** touch backend, /room/:id, recording, or signaling.
- **DO NOT** add Transcripts or Settings real content (Run 2).

## Completion protocol

Commit BEFORE STATUS: DONE.

```
STATUS: DONE — v2-B3 app shell refactor + 4 scenarios green + live verified at voice.silverjrom.app
```

Append to progress.md + callbacks.md:
```
[projcore callback] v2-batch-3 DONE — /app/* shell with sidebar + tabs + stubs
```

— /projcore (Claude, Opus, 2026-05-19)

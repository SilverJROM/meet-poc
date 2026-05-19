# Batch B3 — Angular shell + auth + dashboard

**Persona switch:** Invoke `$lead`. You are NOT `$projcore`. Claude `/projcore` supervises.

**Batch ID:** B3
**Plan:** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/implementation-plan.md`
**Branch:** `feat/meet-rebuild-b3-angular-shell` — create off the current B2 HEAD (FE depends on BE routes existing).

**Requirements assigned (verbatim from og-requirements.md):**
- **R4.1** — Angular 20+ standalone SPA, NO `hidden`-attribute panel toggling
- **R4.2 (B3 slice)** — Routes `/login`, `/dashboard` with auth guards; `/room/:id` route is B4
- **R4.3** — Visual conventions match `~/websites/lokalcamp/frontend/`, density-light
- **R4.4** — Login page (email, password, show-password toggle, error inline)
- **R4.5** — Dashboard page (header brand+email+Logout, create-room form, room list w/ title/created/share-URL/copy-link/Join/Delete)
- **R4.8 (S3.5 closure)** — **stitched-panel symptom absent — no two panels visible simultaneously.** This is the requirement that closes JROM's verbatim complaint.
- **R8.1 (FE half)** — PM2 `meet-poc-fe` entry
- **R8.2** — Consolidated single-port serving via `scripts/serve.js`
- **R8.5 (FE half)** — Build pipeline produces deployable Angular artifacts
- **R9.1** — Playwright e2e under `e2e/tests/` matching lokalcamp pattern
- **R9.2** — Per-batch scenarios with real DOM (no `page.setContent` smell)
- **R9.4** — Per-module targeted runs first

Read before coding:
- `og-requirements.md` (sections R4, R8, R9)
- `scenarios.md` (S3.1–S3.8)
- `project_specs.md` (§ 1 stack, § 6 UI conventions, § 7 testing, § 8 deployment)
- `context-handoff.md` (post-B2 state, API surface, what's locked, what NOT to touch)
- `validation/batch-2.md` if you want the most-recent state evidence

**Reference repo to mirror visually:** `~/websites/lokalcamp/frontend/` — match overall shape:
- Standalone components, signals (`signal()`, `computed()`, `effect()`)
- Per-feature pages under `src/app/pages/<name>/<name>.page.ts|html|scss`
- Services under `src/app/services/`
- Routes in `src/app/app.routes.ts`
- Apollo? NO — we use REST. Lokalcamp uses Apollo because its BE is GraphQL; ours is REST. Use `HttpClient` directly + small typed services.
- Ionic? Yes — match lokalcamp's Ionic component usage where it makes sense (cards, buttons, inputs). Don't force it where vanilla Angular components are simpler.

---

## Context (compressed)

Backend at port 4720 exposes all the REST + WS endpoints B3 needs (see context-handoff.md § "API surface available for FE to call"). No backend changes in B3.

Legacy app at `voice.silverjrom.app` (port 4700) — **do not disturb**.

The "stitched up" symptom: legacy `public/style.css:9` had `.panel.auth { display: flex }` overriding `[hidden]`. Angular's component-based routing means panels are mounted/unmounted by the router, not toggled via CSS — the bug becomes architecturally impossible. **But you must still write the S3.5 Playwright test that asserts NO login form is in the DOM after auth**, because:
1. Test contract anchors closure
2. Possible regression vector if someone later adds CSS that overrides Angular's `*ngIf`/route-outlet

---

## Expected (acceptance criteria)

### Repo structure (Expected)

```
meet-poc/
├── frontend/                                ← new Angular 20 workspace
│   ├── package.json                         ← Angular deps (NO @apollo/client)
│   ├── angular.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.spec.json
│   ├── proxy.conf.json                      ← Angular dev proxy /api + /ws → :4720
│   ├── public/
│   └── src/
│       ├── main.ts
│       ├── index.html
│       ├── styles.scss                      ← global dark-theme baseline
│       └── app/
│           ├── app.config.ts                ← providers (HttpClient, router, …)
│           ├── app.component.ts             ← <router-outlet>
│           ├── app.routes.ts
│           ├── guards/
│           │   ├── auth.guard.ts            ← redirects unauth /dashboard → /login
│           │   └── no-auth.guard.ts         ← redirects auth /login → /dashboard
│           ├── services/
│           │   ├── auth.service.ts          ← /api/login, /api/logout, /api/me; signal-based user state
│           │   └── rooms.service.ts         ← /api/rooms CRUD
│           ├── pages/
│           │   ├── login/
│           │   │   ├── login.page.ts
│           │   │   ├── login.page.html
│           │   │   └── login.page.scss
│           │   └── dashboard/
│           │       ├── dashboard.page.ts
│           │       ├── dashboard.page.html
│           │       └── dashboard.page.scss
│           └── components/
│               └── (shared components if introduced)
├── scripts/
│   └── serve.js                             ← consolidated proxy
├── e2e/                                     ← new Playwright workspace
│   ├── package.json
│   ├── playwright.config.ts
│   ├── fixtures/
│   │   └── auth.ts                          ← real-login helper
│   └── tests/
│       └── b3-shell-auth/
│           ├── login.spec.ts
│           ├── dashboard.spec.ts
│           ├── stitched-symptom-absent.spec.ts   ← S3.5
│           ├── logout.spec.ts
│           └── delete-room.spec.ts
├── ecosystem.config.js                      ← updated (adds meet-poc-fe)
└── package.json                             ← root, updated workspaces to ["backend","frontend","e2e"]
```

### `frontend/package.json` deps (Expected)
- `@angular/{core,common,router,forms,platform-browser,build,cli,compiler,compiler-cli}` ^20
- `@angular/cdk`, `@ionic/angular`, `ionicons` (match lokalcamp; only what's used)
- `rxjs`, `zone.js`, `tslib`
- Dev: `typescript`, `@types/node`, jasmine/karma (optional — Playwright covers e2e)
- **NO `@apollo/client`, `apollo-angular`, `graphql`** — REST only

### `proxy.conf.json` (Expected)
```json
{
  "/api": { "target": "http://localhost:4720", "secure": false },
  "/ws":  { "target": "ws://localhost:4720",   "secure": false, "ws": true }
}
```

### `scripts/serve.js` (Expected behavior)
- Listens on `process.env.PORT || 4710` (consolidated)
- Proxies `/api/*`, `/ws` (WS upgrade), and `/upload` (B5 future) → `http://localhost:4720`
- Proxies everything else → `http://localhost:4711` (Angular dev server `ng serve --port 4711`) when in dev
- In prod (`NODE_ENV=production`): serves `frontend/dist/*` static files instead of proxying to Angular dev
- Use `http-proxy` or `http-proxy-middleware` (whichever is smaller; document choice in decisions/)
- Errors logged with `[serve.js]` prefix

### `ecosystem.config.js` updates (Expected)
Add `meet-poc-fe` entry that runs:
- Dev: a small launcher that starts both `ng serve --port 4711 --proxy-config frontend/proxy.conf.json` AND `node scripts/serve.js` — OR just `node scripts/serve.js` (and document that Angular dev server should be started separately)
- Suggest the simpler shape: `meet-poc-fe` runs only `node scripts/serve.js`; document that `ng serve` is started by `npm run dev:frontend` or via PM2 as a third entry. Pick whichever has fewer moving parts; log the choice.

### Auth flow (Expected)
- `AuthService.user = signal<{email}|null>(undefined)` (undefined = unknown / not yet checked)
- `AuthService.checkSession()` calls `GET /api/me`; sets `user` signal
- `AuthService.login(email, password)` calls `POST /api/login`, sets `user` on success
- `AuthService.logout()` calls `POST /api/logout`, sets `user = null`
- `authGuard`: blocks route if `user === null` after `checkSession`; redirects to `/login`
- `noAuthGuard`: blocks `/login` route if user is signed-in; redirects to `/dashboard`
- Initial app load: app.component runs `checkSession` once before router resolves first route (or use a CanActivateFn that awaits the check)
- Cookies are sent automatically (same-origin via the consolidated proxy)

### Login page (R4.4)
- Form: email input (type=email, required, autocomplete=username), password input (type=password, required, autocomplete=current-password), show-password toggle button (eye icon, aria-label="Show password", aria-pressed toggles), Sign in button
- Inline error display below the form for 401/network errors
- Density-light: match lokalcamp; dark theme baseline

### Dashboard page (R4.5)
- Header bar: brand "meet-poc", spacer, user email, Logout button
- Create-room card: title input, Create room button → on submit calls `RoomsService.create`, refreshes list
- Rooms list card: each room shows title, "Created <local time>", share URL (`<origin>/room/<id>`), Join button (anchor to `/room/<id>` — even though that route is B4, the link can exist), Copy link button (uses Clipboard API; falls back to prompt), Delete button (with `confirm` dialog)
- Empty state: "No rooms yet. Create one above to get a shareable join link."
- "Recordings" section: scaffold an empty section (B5 fills the listing); render heading + placeholder "No recordings yet" — this lets B5 fill in without re-touching the dashboard layout

### Stitched-symptom test (R4.8, S3.5)

```typescript
// e2e/tests/b3-shell-auth/stitched-symptom-absent.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.5 — no login form visible after authentication', async ({ page }) => {
  await loginAsJrom(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  // Critical: the login form must NOT be in the DOM at all (not just hidden)
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  // The dashboard's create-room form should be visible
  await expect(page.locator('button:has-text("Create room")')).toBeVisible();
});
```

### Tests (Expected)
- `e2e/tests/b3-shell-auth/login.spec.ts` — S3.1 (login → /dashboard navigation + dashboard topbar visible)
- `e2e/tests/b3-shell-auth/dashboard.spec.ts` — S3.4 (create room appears in list) + S3.8 (copy-link puts share URL in clipboard)
- `e2e/tests/b3-shell-auth/stitched-symptom-absent.spec.ts` — S3.5
- `e2e/tests/b3-shell-auth/logout.spec.ts` — S3.6 (logout → /login + /api/me null)
- `e2e/tests/b3-shell-auth/delete-room.spec.ts` — S3.7
- `e2e/tests/b3-shell-auth/guards.spec.ts` — S3.2 (`/dashboard` unauth → `/login`) + S3.3 (`/login` auth → `/dashboard`)

Playwright config: `baseURL: 'http://localhost:4710'` (consolidated). Use `webServer` to auto-start the BE + serve.js + ng serve at test time, OR document that the operator (or projcore) starts them before `playwright test`. Pick the simpler path; log decision.

Use `playwright.config.ts` with browser flags including `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` already (B4 needs them; harmless for B3).

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** implement `/room/:id` lobby/call pages — B4.
- **DO NOT** implement `/upload` route or recording — B5.
- **DO NOT** install coturn or touch CF Tunnel — B6.
- **DO NOT** modify backend code unless strictly necessary (B3 is FE-only).
- **DO NOT** restart legacy `meet-poc` PM2 entry.
- No `@apollo/client`. No GraphQL. (Locked decision.)

## Required artifacts

`plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-3/`:

1. `changes.md` — full Codex template; explicitly call out the port numbers picked (consolidated, BE, Angular dev) so /projcore can cross-check.
2. `scenarios-implemented.md` — S3.1–S3.8 each with PASS/FAIL + test path + evidence (use Playwright JSON output or screenshot paths for evidence on the UI-level ones).
3. `test-report.md` — `npx playwright test e2e/tests/b3-shell-auth/` output. Backend vitest still green (`cd backend && npm test`).
4. `review.md`.
5. `independent-validation.md`.
6. `screenshots/` — Playwright screenshots from the test runs (at minimum: login page, dashboard with one room, room list after delete).
7. **Decisions:** `projcore-run-2026-05-19/decisions/2026-05-19-b3-<slug>.md` for each non-trivial autonomous call (port numbers, Angular dev server lifecycle, http-proxy library choice, any visual-spec gap filled with judgement). State "Autonomous decisions: none" in changes.md if truly none.

## Completion protocol

```
STATUS: DONE — B3 Angular shell + auth + dashboard + S3.1-S3.8 green; S3.5 stitched-symptom absent verified
```

OR BLOCKED / NEEDS-INFO.

Append to `progress.md` AND `callbacks.md`:
```
[projcore callback] batch-3 DONE — Angular SPA shell with auth + dashboard; 8 scenarios green; meet-poc-fe up
```

## Confirmation-prompt protocol — mandatory

Before waiting on any tool-confirmation prompt: append to `callbacks.md`:
```
[projcore NEEDS-CONFIRM] <command> — awaiting projcore approval
```

## Model + reasoning guidance

- B3 is the largest-surface batch by file count (Angular scaffold + 5 pages of routing/guard/service + 6 Playwright specs). Cost-aware tier is fine for scaffolding + service wiring; escalate model only if Angular routing or signals reactivity becomes subtle.
- Playwright `webServer` orchestration: keep it boring. If `ng serve` + `node scripts/serve.js` + `tsx backend/src/server.ts` is hard to fit into a single `webServer` array entry, use a small wrapper script or just document operator-managed startup.
- The S3.5 test is the closure of JROM's verbatim complaint. Make sure the assertion is `.toHaveCount(0)` — not `.not.toBeVisible()`. A form that's `display:none` is not visible but is still IN the DOM, which would mean the architectural fix isn't real.

— /projcore (Claude, Opus, 2026-05-19)

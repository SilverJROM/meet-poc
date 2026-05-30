# Scenarios: B6 — Back-to-rooms control on /join page (R9)

> AUTHORED AGAINST THE REAL DOM (verified by reading the live source), NOT the lead's
> hand-off description. The lead's "observed state" referenced `.join-card-inner`,
> `.brand-row`, `.loading-state`, `.name-input` (ion-input), `.continue-btn` (ion-button),
> and `auth.user()` in the template — NONE of those exist in the current join page.
> See "Verified current state" below for the actual structure. Scenarios use the real
> selectors. Implementers MUST honor the selector contract.

## Context / environment
- **Branch:** `feat/meet-diagnostics-audio-20260529` (@ 6a96b9e).
- **App under test:** consolidated proxy `http://localhost:4700` (pm2 `meet-poc-fe` + `meet-poc-be`, both confirmed `online`). `/join` returns HTTP 200.
- **Playwright:** headless chromium via `e2e/playwright.config.ts` (launch flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`). Import the login helper as `import { loginAsJrom } from '../fixtures/auth'` for a spec placed directly in `e2e/tests/` (one `../`, like `rah14-render-smoke-b4b.spec.ts`), or `'../../fixtures/auth'` for a spec in a subfolder (e.g. `e2e/tests/b6-join-back/`). `loginAsJrom(page)` signs in through the UI and asserts landing on `/app/rooms`. Reuse it for all SIGNED-IN cases.
- **Base URL — IMPORTANT (two sources disagree):** the shared `e2e/playwright.config.ts` sets `baseURL = process.env.E2E_BASE_URL || 'http://localhost:4710'`, BUT the running app (pm2) is the consolidated proxy on **`http://localhost:4700`** and the rah14 spec hardcodes its own `const BASE = process.env.E2E_BASE_URL || 'http://localhost:4700'`. To avoid the mismatch, the B6 spec should mirror rah14: declare `const BASE = process.env.E2E_BASE_URL || 'http://localhost:4700'` and `page.goto(`${BASE}/join`)` with absolute URLs (do NOT rely on the config's relative baseURL). When running, set `E2E_BASE_URL=http://localhost:4700` to align both. `loginAsJrom` uses relative `page.goto('/login')`, so run it with the same `E2E_BASE_URL` exported (or point the config baseURL at 4700 for the run).
- **Route under test:** the bare join page is `path: 'join'` → `JoinPage` (NOT `join/:slug`, which loads `RoomPage`). So the URL is **`http://localhost:4700/join`** (no slug). Confirmed in `app.routes.ts`.
- **Back-target routes (confirmed in `app.routes.ts`):** rooms list = `/app/rooms` (under `path: 'app'` → child `rooms`, behind `authGuard`); home = `/` (which `redirectTo: 'app/rooms'`, so for a SIGNED-IN user `/` ultimately lands on `/app/rooms`; for a GUEST the `authGuard` on `/app` bounces to `/login`). See edge-case note in B6-3.
- **Persistent test room:** TEST_ROOM01 slug `3f324d8be763` — NOT needed for these scenarios (the bare `/join` page renders without a room), but available if a signed-in room context is wanted.

## Verified current state (the REAL join page — source-read)
`frontend/src/app/pages/join/join.page.html`:
```
<main class="join-shell">
  <section class="join-card" aria-labelledby="join-title">
    <div class="join-heading"> <p>Join a meeting</p> <h1 id="join-title">Enter a room name</h1> </div>
    <form class="join-form" novalidate (ngSubmit)="submitJoin()">
      <label class="field" for="room-code"> ... <input id="room-code" ...> </label>
      @if (needsPassword()) { ...password field... }
      @if (ready() && signedIn()) { <p class="join-as">Joining as <strong>{{ accountName() }}</strong></p> }
      @else { <label class="field" for="guest-name"> ... <input id="guest-name" ...> </label> }
      @if (error()) { <p class="inline-error" role="alert">{{ error() }}</p> }
      <button type="submit" class="primary-btn" [disabled]="busy()">{{ busy() ? 'Checking...' : 'Continue' }}</button>
    </form>
    @if (ready() && !signedIn()) { <a routerLink="/login">Host sign in</a> }
  </section>
</main>
```
Key facts that drive the scenarios:
- The whole `section.join-card` ALWAYS renders — there is NO `ready()` gate around the card. Only two SUB-blocks are gated: the "Joining as …" line is `@if (ready() && signedIn())`, and the "Host sign in" link is `@if (ready() && !signedIn())`.
- Form fields are NATIVE `<input>`/`<button>`, not Ionic. Submit button = `button.primary-btn` text "Continue", `[disabled]="busy()"` (NOT `canContinue()`).
- The existing "Host sign in" link has NO class — selector is `a[routerlink="/login"]` (Angular lowercases the `routerLink` attribute) with text "Host sign in".
- `join.page.ts` exposes `ready` (signal), `signedIn` (computed `!!auth.user()`), `user` (= `auth.user`), `accountName`. **`auth` is PRIVATE** — the template CANNOT call `auth.user()`. The lobby reference uses `auth.user()` because `room.page` exposes `auth` publicly; the join page must use `signedIn()` / `user()` instead.

The in-call lobby control to MIRROR (`room.page.html:508-510`, styled `.lobby-back-link` at `room.page.scss:296`):
```
<a class="lobby-back-link" [routerLink]="auth.user() ? '/app/rooms' : '/'">
  <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>
  {{ auth.user() ? 'Back to rooms' : 'Back to home' }}
</a>
```
`.lobby-back-link` computed-style facts (from `room.page.scss`): `display:inline-flex; align-items:center; gap:6px; color:#5f6368; font-size:13px; font-weight:700; text-decoration:none;` and `ion-icon{font-size:16px;}`; hover `color:#1a73e8`.

## JROM handshake decision (LOCKED)
Guest behavior = "Back to home → `/`" (NOT hidden). The control shows for BOTH signed-in and guest, mirroring the lobby back-link exactly.

## Selector contract (REQUIRED — implementer MUST honor)
The new control must be addressable independent of Angular's volatile attribute hashing AND must reuse the lobby class for styling parity:
- Anchor carries **`data-testid="join-back-link"`** (primary test handle).
- Anchor carries **`class="lobby-back-link"`** (load-bearing for styling parity, B6-4).
- Anchor contains `<ion-icon name="arrow-back-outline" aria-hidden="true">`.
- Because `auth` is private on `JoinPage`, the bindings MUST use the exposed members:
  - `[routerLink]="signedIn() ? '/app/rooms' : '/'"`
  - text `{{ signedIn() ? 'Back to rooms' : 'Back to home' }}`
  (functionally identical to the lobby's `auth.user() ? …`.)
- Placement: at the TOP of the visible card, ABOVE the `div.join-heading` (so it reads as a back control above the title), inside `section.join-card`.
- `JoinPage` must add `IonicModule`/`IonIcon` (or the standalone `ion-icon`) to its `imports` so `<ion-icon>` renders — note the page currently imports only `FormsModule, RouterLink`. If `ion-icon` is not registered the icon will be an empty custom element; B6-1/B6-2 assert the icon element is present AND has nonzero rendered width, which catches a missing icon registration.

Fallback if `data-testid` is omitted: `section.join-card a.lobby-back-link`. Scenarios note this per case.

---

## Scenario B6-1: Signed-in /join shows "Back to rooms" targeting /app/rooms
**Roles:** signed-in host. **Type:** feature. **AC covered:** AC1.
**Preconditions:** Host signed in via `loginAsJrom(page)` (auth cookie set; `signedIn()` true).
**Steps:**
1. `await loginAsJrom(page)` → lands on `/app/rooms`.
2. `await page.goto(`${BASE}/join`)`; wait `await expect(page.locator('section.join-card')).toBeVisible()`.
3. `const back = page.locator('[data-testid="join-back-link"]')` (fallback `section.join-card a.lobby-back-link`).
**Expected result (assertable):**
- `await expect(back).toBeVisible()`.
- Icon present: `await expect(back.locator('ion-icon[name="arrow-back-outline"]')).toHaveCount(1)` AND rendered: `expect((await back.locator('ion-icon').boundingBox()).width).toBeGreaterThan(0)`.
- Text: `await expect(back).toContainText('Back to rooms')` and `await expect(back).not.toContainText('Back to home')`.
- Target: `await expect(back).toHaveAttribute('href', '/app/rooms')` (Angular RouterLink renders the resolved `href`).
- Top placement: back control's `boundingBox().y` < `div.join-heading` `boundingBox().y` — `expect((await back.boundingBox()).y).toBeLessThan((await page.locator('.join-heading').boundingBox()).y)`.
**Edge case:** if `ion-icon` width is 0, the icon module was not registered → FAIL (treat as a real defect, not a flake).
**Evidence:** screenshot `validation/B6/screenshots/b6-1-signedin-back-to-rooms.png` (full card; control above the title).
**Automatable:** YES (headless).

---

## Scenario B6-2: Guest /join shows "Back to home" targeting /
**Roles:** guest (not signed in). **Type:** feature. **AC covered:** AC2.
**Preconditions:** No auth session. Use a FRESH browser context (`browser.newContext()` → `newPage()`) so no cookie from B6-1 leaks; do NOT call `loginAsJrom`. (Equivalently: clear cookies via `await context.clearCookies()` then reload.) `signedIn()` is false.
**Steps:**
1. Open a clean context/page (no login).
2. `await page.goto(`${BASE}/join`)`; wait `await expect(page.locator('section.join-card')).toBeVisible()`.
3. `const back = page.locator('[data-testid="join-back-link"]')` (fallback `section.join-card a.lobby-back-link`).
**Expected result (assertable):**
- `await expect(back).toBeVisible()`.
- Icon present + rendered (same two assertions as B6-1).
- Text: `await expect(back).toContainText('Back to home')` and `await expect(back).not.toContainText('Back to rooms')`.
- Target: `await expect(back).toHaveAttribute('href', '/')`.
- Top placement: back `y` < `.join-heading` `y` (same as B6-1).
- Coexistence: the existing guest "Host sign in" link is ALSO present — `await expect(page.locator('a[routerlink="/login"]')).toHaveText('Host sign in')` (proves the new control did not replace it; full regression in B6-5).
**Evidence:** screenshot `validation/B6/screenshots/b6-2-guest-back-to-home.png`.
**Automatable:** YES (headless).

---

## Scenario B6-3: Clicking the control while signed-in navigates to /app/rooms
**Roles:** signed-in host. **Type:** feature. **AC covered:** AC3.
**Preconditions:** Host signed in via `loginAsJrom(page)`; currently on `/join`.
**Steps:**
1. `await loginAsJrom(page)`.
2. `await page.goto(`${BASE}/join`)`; wait for `section.join-card` visible.
3. `await page.locator('[data-testid="join-back-link"]').click()` (fallback `section.join-card a.lobby-back-link`).
4. `await page.waitForURL('**/app/rooms')`.
**Expected result (assertable):**
- `await expect(page).toHaveURL(/\/app\/rooms$/)`.
- The rooms page rendered (not bounced to `/login` — the authGuard admits the valid session). Assert the rooms route content is present using the rooms-page landmark already used by other `e2e/` specs (e.g. the rooms list container / create-room control); at minimum `await expect(page.locator('ion-content')).toBeVisible()` and `await expect(page).not.toHaveURL(/\/login/)`.
**Edge case (documents the guest path, not asserted here):** for a GUEST, the control points at `/` which `redirectTo: 'app/rooms'`; the `authGuard` on `/app` then bounces an unauthenticated user to `/login`. That is the accepted "sensible fallback" per the locked decision (guest has no rooms list). A separate optional check could assert a guest click on `/` ends on `/login`, but the LOCKED criterion only requires the signed-in click to reach the rooms list (AC3), so guest-click navigation is NOT a pass/fail gate here.
**Evidence:** screenshot `validation/B6/screenshots/b6-3-signedin-clicked-rooms-list.png` (rooms list after navigation).
**Automatable:** YES (headless).

---

## Scenario B6-4: Rendering matches the lobby .lobby-back-link styling
**Roles:** signed-in host (control guaranteed present). **Type:** feature. **AC covered:** AC4.
**Preconditions:** `loginAsJrom(page)`; on `/join`. The `lobby-back-link` class is load-bearing.
**Steps:**
1. `await loginAsJrom(page)`; `await page.goto(`${BASE}/join`)`; wait for `section.join-card` visible.
2. `const back = page.locator('[data-testid="join-back-link"]')`.
3. `const s = await back.evaluate(el => { const c = getComputedStyle(el); return { display: c.display, columnGap: c.columnGap, gap: c.gap, textDecorationLine: c.textDecorationLine, alignItems: c.alignItems, fontWeight: c.fontWeight, fontSize: c.fontSize, color: c.color }; })`.
**Expected result (assertable — values sourced from `room.page.scss` `.lobby-back-link`):**
- Class reuse: `await expect(back).toHaveClass(/lobby-back-link/)`.
- `expect(['inline-flex','flex']).toContain(s.display)`.
- `expect(s.columnGap === '6px' || s.gap.startsWith('6px')).toBeTruthy()`.
- `expect(s.alignItems).toBe('center')`.
- `expect(s.textDecorationLine).toBe('none')`.
- `expect(s.fontWeight).toBe('700')`.
- `expect(s.fontSize).toBe('13px')`.
- `expect(s.color).toBe('rgb(95, 96, 104)')` (`#5f6368`).
- Icon sizing: `const ic = await back.locator('ion-icon').evaluate(el => getComputedStyle(el).fontSize); expect(ic).toBe('16px')`.
**Edge case:** if the join page's own SCSS overrides any of these (e.g. inherits a different link color from `.join-card a`), the assertions catch the drift; the fix is to scope the lobby styles or reuse the shared class without override.
**Evidence:** screenshot `validation/B6/screenshots/b6-4-styling-parity.png` (close crop) + computed-style object logged in the test report.
**Automatable:** YES (headless).

---

## Scenario B6-5: No regression — guest "Host sign in" link + join form + Continue button unchanged
**Roles:** guest. **Type:** regression. **AC covered:** AC5.
**Preconditions:** clean (no-login) context, `signedIn()` false; on `/join`.
**Steps:**
1. Fresh context/page, no login.
2. `await page.goto(`${BASE}/join`)`; wait for `section.join-card` visible.
3. Assert the pre-existing elements still render/behave as before, alongside the new control.
**Expected result (assertable):**
- Host sign-in link intact: `const signin = page.locator('a[routerlink="/login"]'); await expect(signin).toBeVisible(); await expect(signin).toHaveText('Host sign in')`.
- Room-name input intact: `await expect(page.locator('input#room-code')).toBeVisible()`.
- Guest-name input intact (shown for guests): `await expect(page.locator('input#guest-name')).toBeVisible()`.
- Continue button intact: `const cont = page.locator('button.primary-btn'); await expect(cont).toBeVisible(); await expect(cont).toHaveText('Continue')`.
- Continue NOT disabled at rest (it is gated only by `busy()`, which is false on load): `await expect(cont).not.toBeDisabled()`.
- Submit with empty room name shows the existing inline error (behavior unchanged): click `cont` → `await expect(page.locator('p.inline-error')).toBeVisible()` with text matching `/Room name\/code and your name are required\.|Enter a room name or code\./`.
- Coexistence: BOTH `[data-testid="join-back-link"]` and `a[routerlink="/login"]` are visible simultaneously (new control did not remove the host sign-in link).
**Evidence:** screenshot `validation/B6/screenshots/b6-5-guest-no-regression.png` (full card: back control on top, form + host sign-in link below).
**Automatable:** YES (headless).

---

## Scenario B6-6: Control is auth-resolved (no stale/incorrect link before auth settles)
**Roles:** signed-in host. **Type:** feature. **AC covered:** AC6 (interpreted for the REAL DOM).
**Rationale / DOM reality:** the lead's AC6 ("does not flash before auth resolves, gated on `ready()`") was written for a `ready()`-gated CARD that does NOT exist — the card renders immediately. What MUST hold is that the control's TEXT/TARGET reflects the RESOLVED auth state, never showing the wrong variant. `ngOnInit` calls `await this.auth.ensureSession()` then `this.ready.set(true)`. The recommended implementation keeps the back control's text/target keyed on `signedIn()` (which flips when the session resolves), so before resolution it would read the guest variant and after resolution the signed-in variant for a logged-in user. To avoid showing the wrong variant mid-resolve, the implementer SHOULD gate the back link's content on `ready()` (e.g. render the link only `@if (ready())`, or compute text/target only when `ready()`), mirroring how the existing "Host sign in" / "Joining as" blocks are `ready()`-gated.
**Preconditions:** valid host session cookie present (so post-resolve state is "signed-in").
**Steps:**
1. Sign in once via `loginAsJrom(page)` (establishes the cookie), then in a same-context page `await page.goto(`${BASE}/join`)`.
2. After load settles, assert the control resolves to the SIGNED-IN variant and there is exactly one instance.
**Expected result (assertable, deterministic):**
- Exactly one control, no duplicate/flash artifact: `await expect(page.locator('[data-testid="join-back-link"]')).toHaveCount(1)`.
- Final resolved state is correct for a signed-in user: text contains "Back to rooms" and `href` = `/app/rooms` (i.e., it did NOT get stuck on the guest "Back to home"/`/` variant) — `await expect(page.locator('[data-testid="join-back-link"]')).toHaveAttribute('href', '/app/rooms')`.
- Structural gating proof (if implemented as `@if (ready())`): the control is absent until `ready()` and present after — assert `await expect(page.locator('[data-testid="join-back-link"]')).toBeVisible()` only resolves once `ready()` has flipped (in practice the await for `section.join-card` + the link being visible is sufficient since the link sits inside the card). At minimum, the FINAL state assertions above are authoritative.
**Edge case / note on flash timing:** observing the pre-resolve frame on a fast localhost is racy and NOT made a pass/fail gate; the deterministic gate is "final resolved variant is correct and singular." This keeps B6-6 fully headless with no manual step.
**Evidence:** screenshot `validation/B6/screenshots/b6-6-resolved-signedin-variant.png`. DOM count + final href logged in the test report.
**Automatable:** YES (headless).

---

## Coverage matrix
| AC | Description | Scenario | Automatable |
|----|-------------|----------|-------------|
| 1 | Signed-in /join: control at top, arrow + "Back to rooms", targets `/app/rooms` | B6-1 | YES |
| 2 | Guest /join: control at top, arrow + "Back to home", targets `/` | B6-2 | YES |
| 3 | Click signed-in → navigates to `/app/rooms` | B6-3 | YES |
| 4 | Rendering matches `.lobby-back-link` styling | B6-4 | YES |
| 5 | No regression: "Host sign in" link + form + Continue unchanged | B6-5 | YES |
| 6 | Control reflects resolved auth state, no wrong-variant flash / single instance | B6-6 | YES |

**MANUAL-PENDING items: NONE.** Every criterion is deterministic headless (route render + link text/target/visibility + computed styling + DOM count + navigation). No real-mic / media-device dependency exists for the join-page back control, so there are no manual exceptions — consistent with the task's stated expectation.

## Implementer notes (selector contract recap)
- Add the anchor at the TOP of `section.join-card`, ABOVE `div.join-heading`.
- Anchor: `<a data-testid="join-back-link" class="lobby-back-link" [routerLink]="signedIn() ? '/app/rooms' : '/'"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>{{ signedIn() ? 'Back to rooms' : 'Back to home' }}</a>`. Use `signedIn()` (NOT `auth.user()` — `auth` is private on `JoinPage`). Optionally wrap in `@if (ready()) { … }` to avoid a wrong-variant flash (B6-6).
- Register `ion-icon` in `JoinPage.imports` (currently `[FormsModule, RouterLink]`); without it the icon will not render and B6-1/B6-2 icon-width assertions fail.
- Reuse the `.lobby-back-link` styles (copy the rule into `join.page.scss` or share it) so B6-4 passes; do NOT let `.join-card a {…}` override its color/decoration.
- Do NOT alter `input#room-code`, `input#guest-name`, `button.primary-btn`, or the `a[routerlink="/login"]` host sign-in link (B6-5 guards these).
- The bare join page route is `/join` (no slug); `/join/:slug` is the RoomPage, not this page.

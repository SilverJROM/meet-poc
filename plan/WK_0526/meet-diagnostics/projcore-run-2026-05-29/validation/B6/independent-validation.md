# B6 Independent Validation — R9 back-to-rooms control on /join

Validator: fresh-context independent batch validator (eyes-independent — verdict formed from the requirement + committed code + running app + a throwaway live Playwright probe; plan/scenarios/review/test-report NOT used as evidence).
HEAD verified: `909bec6` on `feat/meet-diagnostics-audio-20260529`.
Diff verified: `git diff 6a96b9e..909bec6 -- frontend/src/app/pages/join/` → 3 files, +30/-1 (clean, scoped to the join page).

## STATUS: PASS

## Static evidence (committed source)

### 1. Control exists, single instance, correct gating — PASS
`frontend/src/app/pages/join/join.page.html:3-8`:
```
@if (ready()) {
  <a class="lobby-back-link" data-testid="join-back-link" [routerLink]="signedIn() ? '/app/rooms' : '/'">
    <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>
    {{ signedIn() ? 'Back to rooms' : 'Back to home' }}
  </a>
}
```
First child of `section.join-card`, above `div.join-heading`. Exactly one instance. Wrapped in `@if (ready())` → renders ONLY after `auth.ensureSession()` resolves (`join.page.ts:53-56` sets `ready` true after the await). No signed-in/guest label flash. Same gate already used by the "Joining as…" line and "Host sign in" link.

### 2. Variant correctness — wrong-variant structurally impossible — PASS
`signedIn()` = `computed(() => !!this.auth.user())` (`join.page.ts:47`). BOTH the label AND the routerLink are keyed off the SAME `signedIn()` expression in the SAME element, so a text/href mismatch is not reachable. Signed-in → "Back to rooms" + `/app/rooms`; guest → "Back to home" + `/`. Matches LOCKED decision (guest = Back to home → `/`, not hidden).

### 3. `/app/rooms` is the real rooms route — PASS
`frontend/src/app/app.routes.ts:20` → `{ path: 'rooms', loadComponent: ...RoomsPage }` nested under `:15` `{ path: 'app', canActivate: [authGuard] }`. `/app/rooms` resolves to the rooms list. `authGuard` (`guards/auth.guard.ts:5-10`) awaits `ensureSession()` then returns `true` if `user` else a UrlTree to `/login` — a signed-in user passes and lands on the list, NOT bounced. Guest fallback `/` → `app.routes.ts:7` redirects to `app/rooms`, where authGuard sends an unauthenticated user to `/login` — the requirement's "sensible fallback (home/login)". Mirrors the in-call lobby's own guest target (`'/'`) → intentional parity.

### 4. Styling matches the in-call lobby back-link — PASS (byte-identical)
`frontend/src/app/pages/join/join.page.scss:120-133` `.lobby-back-link` is byte-for-byte identical to the canonical rule `frontend/src/app/pages/room/room.page.scss:296-309`: inline-flex; align-items center; gap 6px; margin-top 10px; color #5f6368; font-size 13px; font-weight 700; text-decoration none; `ion-icon{font-size:16px}`; hover #1a73e8. The `.lobby-back-link` class selector out-specifies the bare `a` rule (`scss:102` — blue #1a73e8 / underline-on-hover host-sign-in style), so the back link renders gray with the arrow icon. Reference markup `room.page.html:508` keys on `auth.user()`; join uses `signedIn()` = `!!auth.user()` — semantically identical.

### 5. ion-icon renders — PASS
`join.page.ts:2,28` adds `CUSTOM_ELEMENTS_SCHEMA` to `schemas[]` (matches rooms/room page). `main.ts:6` calls `defineIonIcon()` globally → `arrow-back-outline` glyph registered app-wide. `RouterLink` already imported (`ts:4`) and in `imports[]` (`ts:25`).

### 6. "Host sign in" link still present (coexistence) — PASS
`join.page.html:76-78` still renders `<a routerLink="/login">Host sign in</a>` for guests (`ready() && !signedIn()`). Existing form/inputs/Continue button untouched.

### 7. Build is NOT stale — PASS
Served lazy chunk `frontend/dist/meet-poc-frontend/browser/chunk-TOI4EML2.js` contains the new logic verbatim: `u("routerLink",e.signedIn()?"/app/rooms":"/")` and `C(" ",e.signedIn()?"Back to rooms":"Back to home"," ")` + the ion-icon template factory. `http://localhost:4700/join` → HTTP 200.

## Live evidence (throwaway Playwright probe against http://localhost:4700, since removed)
Ran 2 scenarios against the running app; **2 passed (3.1s), 0 console errors in either flow**:

- GUEST (no session) `/join`: `join-back-link` visible; text matches "Back to home"; `href="/"`; `<ion-icon name="arrow-back-outline">` count = 1; "Host sign in" link still visible. Computed `color = rgb(95, 99, 104)` (= **#5f6368** exactly — `0x5f=95, 0x63=99, 0x68=104`, the canonical lobby gray), `text-decoration-line = none`. Console errors: `[]`.
- SIGNED-IN (`loginAsJrom` → reaches `/app/rooms`, then navigated to `/join`): `join-back-link` visible; text matches "Back to rooms"; `href="/app/rooms"`; ion-icon count = 1; computed `color = rgb(95, 99, 104)` (= #5f6368). **Clicking the control navigated to `/app/rooms`** (`toHaveURL(/\/app\/rooms$/)` passed) — NOT bounced to /login. Console errors: `[]`.

Note on a transient false failure: a first probe run reported 2 "failures", but the ONLY failing assertion was a typo in MY expected color (`rgb(95, 96, 104)` instead of the correct `rgb(95, 99, 104)`). The rendered value `rgb(95, 99, 104)` IS exactly #5f6368 (verified by hex→dec conversion). Every other assertion (visibility, text, href, icon, navigation, zero console errors) had already passed before that line. Corrected and re-ran → 2 passed. The code's styling was always correct; the fault was in the validator's test.

## Adversarial probes
- Wrong-variant flash: prevented by `@if (ready())` gate; not observed live. Structurally, label+href share one `signedIn()` expression → cannot diverge.
- Signed-in seeing "Back to home" / guest seeing "Back to rooms": impossible (single source of truth) — confirmed live in both flows.
- `/app/rooms` real & reachable while signed-in: confirmed by route table + guard + live click landing on `/app/rooms`.
- Console errors on /join: none in either guest or signed-in flow.

## Cleanup
Throwaway spec + its `test-results/` artifacts deleted after the run; no test rooms created; working tree clean of validator artifacts.

## Verdict
All R9 clauses are satisfied in the committed code, the served build, and live runtime: a clear arrow + label back control appears on /join with the canonical lobby styling; signed-in → "Back to rooms" → `/app/rooms` (real route, click verified, not login-bounced); guest → "Back to home" → `/` (locked fallback); no auth flash; "Host sign in" preserved; zero console errors. **PASS.**

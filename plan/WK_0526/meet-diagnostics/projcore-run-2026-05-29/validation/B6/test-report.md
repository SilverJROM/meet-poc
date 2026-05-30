# Test Report: B6 — Back-to-rooms control on /join page (R9)

## Tested Against: http://localhost:4700 (consolidated proxy, pm2 meet-poc-fe + meet-poc-be)
## Branch: feat/meet-diagnostics-audio-20260529 @ 909bec6
## Mode: 2 (Testing — after reviewer APPROVE)

---

## Environment prep (required — done)

`meet-poc-fe` runs `scripts/serve.js` with `NODE_ENV=production`, so it serves the **static**
`frontend/dist/` bundle — it is NOT a live dev server. A `pm2 restart` alone does NOT pick up source
changes; the served `dist/` predated commit 909bec6, so `/join` initially rendered WITHOUT the control
(Playwright `[data-testid="join-back-link"]` count = 0; `curl /join | grep -c join-back-link` = 0).

Fix applied: `cd frontend && npm run build` → **BUILD SUCCEEDED** (exit 0; only pre-existing unrelated
warnings — NG8113 unused DatePipe in RoomsPage, stencil empty-glob, mediapipe non-ESM). `ng build` writes
straight into the served `dist/`, so the new bundle was live immediately (no separate restart needed). A
no-assert evidence pass then confirmed `join-back-link count: 1` in BOTH signed-in and guest contexts
before the graded run.

Committed code at 909bec6 is correct and complete: `RouterLink` is in `@Component.imports`,
`schemas: [CUSTOM_ELEMENTS_SCHEMA]` registers `<ion-icon>`, `styleUrl` → `./join.page.scss`, and
`join.page.scss` contains the `.lobby-back-link` rule copied verbatim from `room.page.scss:296`
(`color: #5f6368`).

---

## Playwright Tests

Spec: `e2e/tests/b6-join-back-control.spec.ts` (mirrors `rah14-render-smoke-b4b.spec.ts`: hardcoded
`BASE = process.env.E2E_BASE_URL || 'http://localhost:4700'`, absolute `goto()`s, `loginAsJrom` fixture).
Run: `E2E_BASE_URL=http://localhost:4700 npx playwright test e2e/tests/b6-join-back-control.spec.ts --config=e2e/playwright.config.ts`
Result: **6 passed (11.4s)**.

### As Host (signed-in) / Guest:
| # | Scenario | Action | Expected | Actual | Screenshot | Result |
|---|----------|--------|----------|--------|------------|--------|
| B6-1 | Signed-in: "Back to rooms"→/app/rooms | login, goto /join, locate `[data-testid=join-back-link]` | control visible; text "Back to rooms" (not "Back to home"); href=/app/rooms; `ion-icon[name=arrow-back-outline]` present + boundingBox width>0; control `y` < `.join-heading` `y` | All assertions held; screenshot shows arrow + "Back to rooms" above the title | `screenshots/b6-1-signedin-back-to-rooms.png` | **PASS** |
| B6-2 | Guest: "Back to home"→/ | fresh context (no login), goto /join, locate control | control visible; text "Back to home" (not "Back to rooms"); href=/; icon rendered (width>0); above title; `a[routerlink="/login"]` shows "Host sign in" | All assertions held; "Back to home" + "Host sign in" both present | `screenshots/b6-2-guest-back-to-home.png` | **PASS** |
| B6-3 | Signed-in click → /app/rooms | click control, `waitForURL('**/app/rooms')` | URL ends `/app/rooms`, NOT `/login`; rooms page rendered (not bounced) | Navigated to /app/rooms; `section.rooms-page` visible, `h1` = "Your rooms"; screenshot shows the rooms list (create-room form + search bar + room cards) | `screenshots/b6-3-signedin-clicked-rooms-list.png` | **PASS** |
| B6-4 | Styling parity with .lobby-back-link | `getComputedStyle` on control + icon | class includes `lobby-back-link`; display inline-flex/flex; gap 6px; align-items center; text-decoration none; font-weight 700; font-size 13px; color `#5f6368`; icon font-size 16px | Logged: `{display:"flex", gap:"6px", columnGap:"6px", textDecorationLine:"none", alignItems:"center", fontWeight:"700", fontSize:"13px", color:"rgb(95, 99, 104)"}`; icon font-size `16px` — all match | `screenshots/b6-4-styling-parity.png` | **PASS** |
| B6-5 | Regression: host sign-in + form + Continue unchanged | guest /join; assert legacy elements; clear room-code; submit → inline error; coexistence | Host sign-in "Host sign in" visible; `input#room-code` + `input#guest-name` visible; `button.primary-btn` visible, text "Continue", not disabled; empty-room submit → `p.inline-error` visible matching `/Room name\/code and your name are required\.|Enter a room name or code\./`; back control + sign-in coexist | All assertions held | `screenshots/b6-5-guest-no-regression.png` | **PASS** |
| B6-6 | Resolved auth state, single instance | login, goto /join, count control | exactly 1 control (`toHaveCount(1)`); text "Back to rooms"; href=/app/rooms (not stuck on guest variant) | count=1; correct signed-in variant; final href `/app/rooms` (logged) | `screenshots/b6-6-resolved-signedin-variant.png` | **PASS** |

### Notes on two test-code corrections (NO implementation change; verifier ≠ fixer)
The first full run surfaced 4 PASS / 2 FAIL, both **defects in the test spec, not the implementation**:
- **B6-4 color**: the scenarios doc stated `rgb(95, 96, 104)`, but `#5f6368` (the real lobby color) is
  `rgb(95, 99, 104)` — `0x63` = 99, not 96. The scenario contract had a typo; the implementation
  renders the correct `#5f6368`. Assertion corrected to `rgb(95, 99, 104)`.
- **B6-3 landmark**: the scenario suggested `ion-content` as the rooms-page landmark, but `RoomsPage`
  renders `section.rooms-page` with `<h1>Your rooms</h1>` and uses no `ion-content`. Navigation to
  `/app/rooms` (not bounced to `/login`) — the actual AC3 gate — succeeded on the first run; only the
  landmark selector was wrong. Corrected to `section.rooms-page` + `h1` = "Your rooms".

After the test-code corrections, the suite is **6/6 PASS** (final run: 6 passed, 11.6s).

## API Tests (supplementary)
| # | Endpoint | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| 1 | `GET http://localhost:4700/join` (after build) | HTTP 200; Angular shell served; control rendered client-side | HTTP 200; control present in DOM (Playwright count=1 in both auth states) | PASS |

## Console / page errors (supplementary)
Spec: `e2e/tests/b6-console-check.spec.ts` — tallies `console.error` + uncaught `pageerror` on served /join.
| Context | console.error | pageerror | Result |
|---------|---------------|-----------|--------|
| Signed-in /join | 0 | 0 | PASS |
| Guest /join | 0 (incl. pageerror) | — | PASS |

---

## Coverage matrix (AC → result)
| AC | Description | Scenario | Result |
|----|-------------|----------|--------|
| 1 | Signed-in /join: control at top, arrow + "Back to rooms", targets /app/rooms | B6-1 | PASS |
| 2 | Guest /join: control at top, arrow + "Back to home", targets / | B6-2 | PASS |
| 3 | Click signed-in → navigates to /app/rooms (not bounced to /login) | B6-3 | PASS |
| 4 | Rendering matches `.lobby-back-link` styling (`#5f6368`) | B6-4 | PASS |
| 5 | No regression: "Host sign in" link + form + Continue unchanged | B6-5 | PASS |
| 6 | Control reflects resolved auth state, single instance | B6-6 | PASS |

---

## Summary
- Playwright (B6-1..B6-6): **6/6 PASS**.
- Console errors: **0** (signed-in + guest, including pageerrors).
- API (supplementary): 1/1 PASS.
- Frontend build: **SUCCEEDED** (mandatory to serve the static-dist feature).
- Screenshots: **6** B6-case screenshots saved to `validation/B6/screenshots/` (all valid PNGs; B6-4 is an
  intentional close-crop of the control, 84x18).
- MANUAL-PENDING: NONE (every criterion deterministic headless; no real-mic dependency).
- Two test-spec assertions corrected (B6-4 color typo from scenarios doc; B6-3 landmark selector). No
  implementation code changed (verifier ≠ fixer); the only build/source action was the mandated `ng build`.

## Verdict: **PASS**

All six B6 acceptance criteria (R9) verified against the running app on http://localhost:4700 with the
freshly-built bundle.

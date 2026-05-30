# Code Review: Batch 6 — Back-to-rooms control on /join page (R9)

Commit under review: `909bec6` (parent `6a96b9e`). Branch `feat/meet-diagnostics-audio-20260529`.
Reviewer: [reviewer], adversarial gate before QA. Verified against the committed git blobs (`git show 909bec6:…`), not the working tree or changes.md prose.

## Verdict: APPROVE

## Diff Summary
```
 frontend/src/app/pages/join/join.page.html  |  7 ++++
 frontend/src/app/pages/join/join.page.scss  | 21 ++++++++++
 frontend/src/app/pages/join/join.page.ts    |  3 +-
 .../validation/B6/changes.md                | 49 +++++++++++++++ (artifact)
 4 files changed, 79 insertions(+), 1 deletion(-)
```
Production code touched: ONLY `join.page.{html,scss,ts}` (the changes.md is the batch artifact). No audio/diagnostics/backend/form-refactor creep.

## Codex-Template Section Check (Rule 9)
- User Report (verbatim brief quote): ✓
- Root Cause (mechanism-level — names the scoped-style mechanism + missing affordance + `ready()` gating + `signedIn()` private-`auth` rationale): ✓
- Code Changes (per-file WHAT + WHY): ✓
- Verification (build PASS + render expectations; DEV deploy deferred to projcore gate per §8.6 — acceptable for a sub-agent build-only task): ✓
- Caveats (regression markers + the disclosed clobber/revert + scss-duplication rationale): ✓

## Clobber-revert integrity check (brief item 2)
The dev disclosed a mid-session accidental `Write` that clobbered `join.page.html` with a non-existent Ionic structure, then reverted via `git checkout --`. I diffed the COMMITTED blobs against parent `6a96b9e` to confirm no residue:
- Committed `join.page.html` = original 73 lines + exactly the 7-line `@if (ready()) { <a.lobby-back-link>…</a> }` block inserted at the top of `section.join-card`. No stray Ionic structure, no `.join-card-inner`/`.brand-row`/`ion-input`/`ion-button`, no hallucinated content. Clean.
- Committed `join.page.ts` = parent + exactly `CUSTOM_ELEMENTS_SCHEMA` added to the core import and `schemas: [CUSTOM_ELEMENTS_SCHEMA]` to `@Component`. Nothing else.
- Committed `join.page.scss` = parent (lines 1-112 byte-identical, incl. the bare `a {…}` and `a:hover {…}`) + the appended `.lobby-back-link` block. No duplicate selectors, no leftover garbage.
- Working tree == committed (`git diff 909bec6 -- join.page.ts` empty). Nothing uncommitted lurking.
Revert verified clean.

## Scenario Coverage + Brief Anchoring (Rule 10)
| AC / Scenario | Addressed in diff | Evidence (committed) |
|---|---|---|
| AC1 / B6-1 signed-in "Back to rooms" → /app/rooms, top placement, icon | YES | html:4-6 `[routerLink]="signedIn() ? '/app/rooms' : '/'"`, label `'Back to rooms'`, `<ion-icon name="arrow-back-outline">`, anchor is first child of `section.join-card` above `.join-heading` |
| AC2 / B6-2 guest "Back to home" → / | YES | same ternary false-branch `'/'` + `'Back to home'` |
| AC3 / B6-3 click signed-in → /app/rooms | YES | RouterLink resolves to real route — `app.routes.ts:15-20` `path:'app'`→child `rooms` behind `authGuard`; valid session admitted |
| AC4 / B6-4 styling parity with `.lobby-back-link` | YES | scss:120-133 faithful copy; class out-specs the bare `a` rule → gray #5f6368 not blue |
| AC5 / B6-5 no regression (Host sign in + form + Continue) | YES | parent form/inputs/button/`a[routerlink="/login"]` byte-unchanged; only the prepend was added |
| AC6 / B6-6 auth-resolved, single instance, no wrong-variant flash | YES | whole control wrapped in `@if (ready())`; `ready` flips after `auth.ensureSession()` in `ngOnInit` |

No out-of-scope changes. Every line traces to R9 / a scenario AC.

## Correctness (brief checklist 3) — all PASS
- **Binds the public computed, not private `auth`.** Template uses `signedIn()` and `ready()` (html:3-6). `JoinPage` defines `readonly ready = signal(false)` (ts:41), `readonly signedIn = computed(() => !!this.auth.user())` (ts:47). Both PRE-EXISTED on the parent (used by the "Joining as"/"Host sign in" blocks) — the dev correctly reused them and did NOT touch private `auth` from the template. ✓
- **routerLink ternary correct.** `/app/rooms` confirmed real in `app.routes.ts:15-20`; guest `/` confirmed (`app.routes.ts:7` `redirectTo: 'app/rooms'`, authGuard bounces unauth → /login = the locked "sensible fallback"). ✓
- **Labels** "Back to rooms" / "Back to home" exactly match R9 + JROM's locked guest-→`/` decision. ✓
- **`@if (ready())` gate present** wrapping the whole control (html:3) — no wrong-variant flash, mirrors the existing `ready()`-gated blocks. ✓
- **`<ion-icon name="arrow-back-outline">` present** (html:5) AND **`CUSTOM_ELEMENTS_SCHEMA` added** to `@Component.schemas` (ts:2 import, ts:28 schemas) — required for ion-icon to render in this repo. ✓
- **`.lobby-back-link` SCSS faithful + out-specs the bare `a`.** Reference `room.page.scss:296-313`: inline-flex / align-items:center / gap:6px / color:#5f6368 / font-size:13px / font-weight:700 / text-decoration:none / `ion-icon{font-size:16px}` / hover #1a73e8 — all reproduced in join scss:120-133. A `.class` selector (0,1,0) out-specifies the bare element `a` selector (0,0,1), so the back link renders gray #5f6368, NOT the blue (#1a73e8/underline-on-hover) Host-sign-in style. Confirmed against B6-4's exact computed-style assertions. ✓

## Code Quality
- Minimal, surgical, mirrors the established lobby pattern. The `data-testid="join-back-link"` selector contract from scenarios.md is honored (html:4), so the B6 spec's primary handle works.
- Two cosmetic deltas from the reference rule, neither load-bearing and both within B6-4's tolerances:
  - Adds `margin-top: 10px` (not in the lobby rule). Reasonable for top-of-card spacing in a `display:grid; gap:22px` card; B6-4 does not assert margin. Acceptable.
  - Omits the reference's `transition: color 0.15s ease`. Purely a hover animation nicety; no scenario asserts it. Acceptable (not flagging — visual parity criteria all still pass).

## Convention Conformance (project_specs.md)
- §6 "All panel transitions via Angular Router" — uses `[routerLink]`, not manual nav. ✓
- §1 standalone component + signals — consistent. ✓
- `CUSTOM_ELEMENTS_SCHEMA` for ion-icon matches the repo pattern (sibling pages register the schema for Ionicons). ✓

## changes.md quality
Root Cause is genuinely mechanism-level (scoped component styles + missing affordance + `ready()`/`signedIn()` rationale), not symptom-level. Per-file WHAT+WHY present and accurate to the committed code. The disclosed clobber/revert is honestly documented and I independently verified the final commit is clean. Note: the changes.md "Verification: build PASS" is a sub-agent self-report and DEV deploy was correctly deferred to the projcore PM2-restart gate (§8.6) — QA must still run the build + B6-1..B6-6 Playwright suite on the deployed URL; that is the next gate, not a blocker here.

## Concerns (non-blocking, for QA)
- This task ran in a checkout where `app.routes.ts` and the rooms page DO exist (confirmed `app.routes.ts:20` `rooms` child) — so `/app/rooms` resolves. QA should still confirm the live navigation (B6-3) and the computed-style parity (B6-4) on the deployed app, since those are the load-bearing proofs.
- changes.md cites `room.page.scss:296` as the source; verified accurate.

## Required Changes (if REVISE)
None.

---

STATUS: DONE

---
---

## Test Report Verification (Mode 2) — appended 2026-05-30

Verifying QA's `test-report.md` for B6 against the on-disk evidence at 909bec6. All checks below
are FIRSTHAND: ran `ls -la` / `file` / `wc -c` on the PNGs, VIEWED each screenshot, and read the
committed source via `git show 909bec6:…`.

### Evidence Check
- **Screenshots exist: YES (count: 6).** All non-trivial, valid PNGs (firsthand `file` + `wc -c`):
  - `b6-1-signedin-back-to-rooms.png` — 23832 B, PNG 1280x720
  - `b6-2-guest-back-to-home.png` — 25542 B, PNG 1280x720
  - `b6-3-signedin-clicked-rooms-list.png` — 344341 B, PNG 1280x3078 (full rooms list page)
  - `b6-4-styling-parity.png` — 1619 B, PNG 127x16 (intentional element close-crop of the control)
  - `b6-5-guest-no-regression.png` — 27957 B, PNG 1280x720
  - `b6-6-resolved-signedin-variant.png` — 23832 B, PNG 1280x720
  None are 0-byte; none are placeholder stubs. I VIEWED each — they show the real feature rendered
  (not blank, not a hardcoded text panel). See per-scenario notes below.
- **Tested against:** `http://localhost:4700` (consolidated proxy, pm2 fe+be) — declared in the
  report header, consistent with the scenarios' base-URL guidance and the spec's hardcoded BASE.
- **Playwright used: YES** — real spec `e2e/tests/b6-join-back-control.spec.ts` (read in full).

### Spec validity — real browser test, not theater (lead.md Rule 11 applied at review)
The spec is **REAL**. Confirmed line-by-line against the source:
- Loads the running app at an absolute real URL: `page.goto(`${BASE}/join`, { waitUntil:
  'networkidle' })`, `BASE = process.env.E2E_BASE_URL || 'http://localhost:4700'`. NO
  `page.setContent`, NO static HTML stub, NO source-regex dressed as a browser assertion.
- Real UI login fixture `loginAsJrom` (`../fixtures/auth`) for signed-in cases; fresh
  `browser.newContext()` (no cookie leak) for guest cases — correct auth isolation (B6-2/B6-5).
- Asserts on the RENDERED DOM: `toBeVisible`, `toHaveAttribute('href', …)`, `toContainText`,
  `boundingBox()` geometry (top-placement + nonzero icon width), live `getComputedStyle` via
  `back.evaluate(el => getComputedStyle(el)…)`.
- **B6-3 is a REAL cross-route navigation, not a stub:** `page.locator(BACK).click()` →
  `page.waitForURL('**/app/rooms')` → `toHaveURL(/\/app\/rooms$/)` + `not.toHaveURL(/\/login/)` +
  asserts the destination actually rendered (`section.rooms-page` visible, its `h1` = "Your rooms").
  The 1280x3078 b6-3 screenshot confirms the genuine rooms list rendered (create-room form, search
  bar, dozens of room cards) — the live /app/rooms route, not a fabricated page.
- Icon assertions (`ion-icon[name="arrow-back-outline"]` count + `boundingBox().width > 0`) really
  exercise the icon-registration failure mode the scenarios flagged.

### Coverage Check
| Scenario | Test case in spec | Screenshot (firsthand-viewed) | Result |
|----------|-------------------|-------------------------------|--------|
| B6-1 | YES (L16-42) | b6-1 — "Back to rooms" + arrow ABOVE the title, signed-in card | PASS |
| B6-2 | YES (L45-77, fresh guest ctx) | b6-2 — "Back to home" + "Host sign in" both present, guest card | PASS |
| B6-3 | YES (L80-95, real nav) | b6-3 — actual /app/rooms list rendered (not bounced to /login) | PASS |
| B6-4 | YES (L98-138, getComputedStyle) | b6-4 — gray "Back to rooms" element close-crop | PASS |
| B6-5 | YES (L141-177, regression) | b6-5 — guest form + inline error "Enter a room name or code." | PASS |
| B6-6 | YES (L180-197, count=1) | b6-6 — single signed-in "Back to rooms" variant | PASS |

All 6 scenarios map 1:1 to a test case AND a distinct, non-trivial screenshot. No gaps.

### Disclosed test-spec corrections — legitimate test-side fixes, NOT defect-masking
1. **B6-4 color `rgb(95,99,104)` vs scenario-doc `rgb(95,96,104)`.** The scenario doc's value is
   arithmetically WRONG: `#5f6368` = `(0x5f,0x63,0x68)` = `(95, 99, 104)`; `0x63` = 99, not 96. The
   spec's corrected value is the CORRECT decode of `#5f6368`. **Confirmed firsthand the
   implementation renders the real lobby color:** `git show 909bec6:…/join.page.scss` shows
   `.lobby-back-link { … color: #5f6368; }` (scss:125), copied verbatim from `room.page.scss:296`
   (also `color: #5f6368`, confirmed firsthand). The correction aligns the test to the real,
   intended color — a legitimate fix of a typo in the contract doc, NOT a relaxation hiding a wrong
   implementation color. Fully closed.
2. **B6-3 landmark `section.rooms-page` + h1 "Your rooms"** vs the scenario's hedged `ion-content`.
   The scenarios doc itself said "at minimum `ion-content`"; RoomsPage actually renders
   `section.rooms-page`/`<h1>Your rooms</h1>` and uses no `ion-content` (the b6-3 screenshot
   confirms the rooms-page layout). Switching to the actual landmark is a STRONGER assertion than a
   generic Ionic wrapper, and the AC3 gate (reached /app/rooms, not bounced to /login) is preserved
   and unconditioned. Legitimate test-side fix.

Both corrections are test-side, neither loosens an AC, and #1 is confirmed against the real source.

### Console-error count
Reported 0 console.error + 0 pageerror in BOTH signed-in and guest contexts via
`e2e/tests/b6-console-check.spec.ts`. The count is disclosed. (That supplementary spec was not part
of my inputs and I did not re-run it; it is supplementary, not a B6 AC gate.)

### Verdict consistency
Report self-reports 6/6 PASS across the body table, the AC coverage matrix, and the summary —
internally consistent. Graded run stated 6 passed (11.6s) after the two test-side corrections.

### Verdict: VERIFIED

All six B6 scenarios have a real test case and a non-trivial, firsthand-viewed screenshot; the spec
genuinely loads the running app and asserts on the rendered DOM (B6-3 is a real /app/rooms
navigation + render, not a static stub); the two disclosed corrections are legitimate test-side
fixes (the color is confirmed to be the real `#5f6368` in the committed source). Report is 6/6 PASS,
internally consistent. The mandatory frontend build was run to serve the static dist. No
implementation defect surfaced.

---

STATUS: DONE

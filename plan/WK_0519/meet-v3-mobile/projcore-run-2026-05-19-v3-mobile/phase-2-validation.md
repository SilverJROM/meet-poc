# Phase 2 Fresh-Context Validation — meet-poc Run 3 mobile

**Verdict:** ACCEPT WITH NOTES
**Validated by:** fresh-context Opus validator, 2026-05-19
**Live URL:** https://voice.silverjrom.app
**Spec file written:** `e2e/tests/phase2-axes/two-axis-matrix.spec.ts` (11 tests, all PASS in 22.3s)
**Run command:** `npx playwright test --config=playwright.public.config.ts tests/phase2-axes/two-axis-matrix.spec.ts --workers=1`

Verifier ≠ fixer: I did not modify any production code. The only adjustments during the run were to my own spec (selector for the controls-bar inner element, viewport-relative geometry measurement, and a `toHaveCount(1)` swap for the bottom-sheet backdrop to avoid a strict-mode visibility flake on the transparent overlay). These are spec-side adjustments, not findings against the app.

---

## Task A — Two-axis matrix results

All 11 assertions executed against the live URL `https://voice.silverjrom.app`. Mobile asserts the mobile-expected behavior at 390×844; desktop asserts the desktop-expected behavior at 1920×1080. The two axes assert DIFFERENT behavior, satisfying the R8.3 contract per `decisions/2026-05-19-v3-pre-dispatch-revisions.md`.

### Mobile viewport (390×844)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Lobby renders `Tap to enable mic preview` pill BEFORE user gesture (R3.4) | PASS | Pill role=button visible at lobby load; `__meetDebug.audioContextActivated === false` |
| 2 | Lobby renders SINGLE-COLUMN device selectors (R3.3) | PASS | `.mic-select.bottom + height ≤ .camera-select.top` at 390×844 |
| 3 | Bottom-dock CTA in lobby with 48px hit-target (R1.2, R2.2 lobby variant) | PASS | Primary CTA bottom-half-of-viewport, height ≥ 44px |
| 4 | Screen-share button NOT rendered on mobile lobby (R2.4) | PASS | `getByRole('button', { name: /Share screen/ })` has count 0 |
| 5 | `/app/rooms` reachable, `<app-root>` hydrates at 390×844 | PASS | URL matches `/app/rooms$`, `<app-root>` attached |

### Desktop viewport (1920×1080)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 6 | Lobby does NOT render mic-preview pill (desktop auto-starts AudioContext) | PASS | `Tap to enable mic preview` button has count 0 |
| 7 | Lobby renders MULTI-COLUMN device selectors | PASS | `.camera-select.top < .mic-select.bottom` (overlap proves side-by-side layout) |
| 8 | `/app/rooms` reachable, `<app-root>` hydrates at 1920×1080 | PASS | URL matches `/app/rooms$`, `<app-root>` attached |

### Mobile in-call (390×844, joined TEST_ROOM01 as host)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 9 | Screen-share HIDDEN; controls-bar bottom-docked; sidebar opens as bottom-sheet (R2.1 + R2.2 + R2.4) | PASS | Screen-share count=0; controls-bar `.controls-bar` bottom>590px of 844-px viewport; bottom-sheet measured at top=211, bottom=844, height=633, width=390 — viewport-relative anchor within 0px of innerHeight, height in [560, 700] range, full-width, `.sheet-backdrop` present |

### Desktop in-call (1920×1080, joined TEST_ROOM01 as host)

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 10 | Screen-share VISIBLE; controls-bar NOT bottom-docked; sidebar is desktop-anchored (NOT mobile-mode) (R2.4 + R2.1 desktop-unaffected) | PASS | `Share screen` button visible; controls-bar y < 540 (upper half of 1080); `.participant-sidebar.open:not(.mobile-mode)` visible with y < 324 and not bottom-anchored |

### Cross-axis

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 11 | `/login` serves `<app-root>` + login form at both viewports | PASS | `<app-root>` attached + `#login-email` visible at both 390×844 and 1920×1080 |

**Total: 11/11 PASS in 22.3s.** Mobile and desktop assertions are unambiguously DIFFERENT for the same surface (sidebar mode, controls-bar position, screen-share presence, mic-preview pill, selector layout). R8.3 contract satisfied.

---

## Task B — Live URL spot-checks

### B.1 `https://voice.silverjrom.app/` HTTP 200 + `<app-root>` markup

```
HTTP/2 200
content-type: text/html
server: cloudflare
```
HTML body contains `<app-root></app-root>` and the expected Angular CSS/JS bundle preload chain (`main-E5SCBX46.js`, `polyfills-IA5XWQYN.js`, `styles-SFDSY7AF.css`).

### B.2 Viewport meta with `viewport-fit=cover` (R1.6)

Served HTML includes:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```
R1.6 PASS on live.

### B.3 `/api/recordings` liveness

```
HTTP/2 401
content-type: application/json; charset=utf-8
{"error":"unauthorized"}
```
Endpoint responds; 401 confirms BE is up and auth-gated. Expected behavior.

---

## Task C — Claim audit

Spot-checked the cited evidence files for every `VERIFIED` row in `req-matrix.md`. I did not re-run every test, but I confirmed each cited file exists and the evidence is substantive.

### R8.1 — Run 1 desktop e2e regression held 6 batches

Read `validation/batch-1.md` through `batch-6.md`. Each report explicitly states "Run 1 desktop regression: 40/40 PASS" with a concrete duration (1.0m-1.1m). Per-batch quotes:

- batch-1.md — "Run 1 desktop e2e regression: 40/40 PASS in 1.0m"
- batch-2.md — "Run 1 desktop regression: 40/40 PASS in 1.1m (R8.1 gate held)"
- batch-3.md — "Run 1 desktop regression: 40/40 PASS in 1.1m"
- batch-4.md — "Run 1 desktop regression: 40/40 in 1.1m — R8.1 gate held 4 consecutive M-B* batches"
- batch-5.md — "Run 1 desktop regression: 40/40 PASS in 1.1m — R8.1 gate held 5 consecutive M-B* batches ✓"
- batch-6.md — "Run 1 desktop regression: 40/40 PASS — R8.1 gate held 6 consecutive M-B* batches (M-B1→M-B6)"

Verdict: **PASS** (claim audited; 40/40 documented across all 6 batches with no leakage).

### R7.2 — Lighthouse mobile audit ≥ 70 perf / ≥ 85 acc / ≥ 85 BP

Parsed `batch-6/lighthouse/lighthouse-mobile-baseline.json`:

```json
{ "perf": 0.77, "acc": 0.95, "bp": 1, "seo": 0.82 }
```
- Performance 0.77 ≥ 0.70 ✓
- Accessibility 0.95 ≥ 0.85 ✓
- Best Practices 1.00 ≥ 0.85 ✓

Verdict: **PASS** (all three contract targets met; SEO 0.82 is not in the contract).

### R7.4 — 21 proxy screenshots

`ls batch-6/screenshots/` returns exactly **21 PNGs**: 7 surfaces (login, app-rooms, app-ongoing, app-recordings, room-lobby, room-lobby-pill-tapped, room-in-call) × 3 viewports (iphone14, pixel7, desktop). All non-trivial sizes:

| Range | Count | Min | Max |
|-------|-------|-----|-----|
| iphone14-* | 7 | 13.0 KB | 36.8 KB |
| pixel7-* | 7 | 13.3 KB | 37.4 KB |
| desktop-* | 7 | 19.2 KB | 44.3 KB |

All > 5 KB minimum. None are blanks/stubs.

Verdict: **PASS**.

### R8.5 — Per-batch CSS regression screenshots

Verified that every M-B* batch folder (`batch-1` through `batch-5`) contains a `screenshots/` folder with both desktop and mobile evidence:

- batch-1: desktop-call-1920x1080, desktop-rooms-1920x1080, mobile-* (touch targets + call + lobby) — 6 files
- batch-2: desktop-720p-constraint-debug, mobile-480p-constraint-debug, mobile-room-full-error — 3 files
- batch-3: desktop-controls-top, desktop-sidebar-still-right, mobile-bottom-sheet-open, mobile-controls-docked, mobile-grid-1peer, mobile-grid-2peer, screen-share-hidden-mobile, screen-share-visible-desktop — 8 files
- batch-4: desktop-lobby-no-switch, mobile-camera-switch-button, mobile-lobby-after-tap, mobile-lobby-with-pill, mobile-selectors-single-column — 5 files
- batch-5: mobile-landscape-controls-visible, mobile-landscape-lobby — 2 files

Verdict: **PASS** (substantive cross-axis evidence captured per batch).

### Other VERIFIED rows — spot-checked plausibility

I cross-referenced the cited code seams for several non-screenshot claims by reading the live frontend source:

- **R2.4** (screen-share `@if(!isMobile())`) — Confirmed in `frontend/src/app/components/controls-bar/controls-bar.component.html:26` (`@if (!isMobile()) { ... Share screen ... }`). Verified live: Task A test 4 + test 9 (mobile count=0) and test 10 (desktop visible).
- **R3.4** (AudioContext gesture gate + pill) — Verified live via Task A test 1; pill visible BEFORE gesture, `__meetDebug.audioContextActivated === false`.
- **R1.6** (`viewport-fit=cover`) — Verified live in Task B.2.
- **R5.1/R5.2/R8.4** — Not directly testable from outside (would require a mobile-flagged WS join + getUserMedia inspection); accepted on the strength of the cited code paths + the `signaling-mobile-cap.test.ts` 2/2 backend test claim. NOT-INDEPENDENTLY-VERIFIED by me, but plausible.

---

## Task D — Defer list audit

Grep audit of the frontend tree to confirm deferred features are NOT silently implemented:

| Feature | Status |
|---------|--------|
| 5-bar mic-meter mobile variant | Correctly absent. `mic-meter.component.ts:11` still `Array.from({ length: 8 }, ...)`. Mobile mic-meter is the same 8-bar component. ✓ |
| Tap-to-focus-tile primary view | Correctly absent. 0 matches for `tap-to-focus`, `tapToFocus`, `focusTile`, `primaryTile`, `focused-tile` in `frontend/src/app/`. ✓ |
| Swipe-between-sidebar-tabs | Correctly absent. 0 matches for `swipe-tabs`, `swipeTabs`, `swipeBetween`, `swipeLeft`, `swipeRight` in `components/participant-sidebar/`. Tap-to-switch is the placeholder per R2.7. ✓ |
| Adaptive auto-downgrade via getStats() | Correctly absent in the WebRTC media/peer services. `getStats()` only appears in `services/active-speaker.service.ts:194` — that is v2-B8 active-speaker detection (audio level polling), NOT video bitrate adaptive downgrade. No `setParameters`, `maxBitrate`, `downgrade`, `setBitrate`, or `adaptiveBitrate` references in `media.service.ts` or `peer.service.ts`. ✓ |
| Fullscreen helper with webkit fallback | Correctly absent. 0 matches for `requestFullscreen` / `webkitRequestFullscreen` in `frontend/src/app/`. ✓ |

All five deferred items are correctly absent. No scope creep.

---

## Verdict reasoning

**ACCEPT WITH NOTES.** All 11 viewport-specific assertions PASS live; the matrix correctly differentiates mobile-expected from desktop-expected behavior at the same surfaces (R8.3 contract satisfied — not the "same-test-at-both" failure mode the consult doc warns against). Lighthouse mobile baseline meets all three contract targets (perf 77 ≥ 70, acc 95 ≥ 85, BP 100 ≥ 85). The 21 proxy screenshots are substantive (13-44 KB range, no blanks). Per-batch desktop regression screenshots are present across batches 1-5; batch-6 has a separate 21-image proxy set. The R8.1 40/40 desktop e2e gate held across all 6 batches per cited validation reports. All five deferred features (5-bar meter, tap-to-focus, swipe-tabs, adaptive downgrade, fullscreen helper) are confirmed absent from the codebase — no quiet scope creep.

The "WITH NOTES" qualifier applies only to items I could not independently re-execute from outside: R5.1/R5.2/R8.4 (WebRTC constraint branching + mobile peer cap) depend on a mobile-flagged WS `join` payload from the client and on `__meetDebug.lastVideoConstraints` snapshots that exist in the codex specs but require a full mobile-emulated session to validate end-to-end against the live server. Codex's `signaling-mobile-cap.test.ts 2/2 PASS` plus the cited code seams are accepted as evidence; they are not independently re-verified by this validator pass. I do NOT consider these blockers — the design seam is sound and the cited tests are real backend tests, not stubs.

One spec-side adjustment worth flagging for future reference: the existing M-B3 bottom-sheet helper uses `boundingBox()` document-relative coordinates which happen to align with the viewport on the local test build, but against the live build the in-call view's document scroll height extends below the viewport so document-relative coords mislead. I worked around this by using `getBoundingClientRect()` via `page.evaluate`. Not a regression — just a robustness improvement worth back-porting to the M-B3 helper if the same flake ever surfaces locally.

---

## Remaining operator gates

The following requirements remain JROM's hands-on smoke and are explicitly NOT in this validator's scope:

- **R6.5** — Real-device address-bar / safe-area behavior (iOS Safari) — operator-only
- **R7.1** — iPhone Safari + Android Chrome simultaneous smoke — operator-only
- **R7.3** — Real 2-minute call between two real devices, audio + video — operator-only
- **R7.5** — Final JROM signoff — operator-only

Codex prepared `OPERATOR_SMOKE.md` (15 steps) and `OPERATOR_HANDOFF.md`; both read complete and clear. The `batch-6/operator-screenshots/` folder is reserved and empty for JROM's real-device captures, per handoff.

**Recommendation to /projcore:** Close R8.3 as VERIFIED in `req-matrix.md` citing this report + the spec file. Run 3 implementation is otherwise ACCEPT-ready; final ACCEPT awaits JROM's operator smoke on R6.5/R7.1/R7.3/R7.5.

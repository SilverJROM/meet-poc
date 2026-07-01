# Batch-SS test report (R7)

## Build
`ng build --configuration production` — green (pre-existing unrelated warnings only:
stencil `entry.js` glob, `@mediapipe/selfie_segmentation` CJS notice).

## E2E — isolated stack
Run against an isolated e2e stack (`E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811
E2E_PROXY_PORT=4810`) to avoid colliding with the persistent dev/qa server already running on
this machine (backend port 4720 was already bound by another process at PID 2624096 — did
NOT touch it).

| Spec | Result | Notes |
|---|---|---|
| `batch-ss-presenting-placeholder/presenting-placeholder.spec.ts` (new) | **PASS** | R7a+R7b+R7c, both screenshots captured |
| `v3-fixc3-share-reflow/share-reflow.spec.ts` — FIXC3.1 (swapped assertion) | **PASS** | |
| `v3-fixc3-share-reflow/share-reflow.spec.ts` — FIXC3.2 | FAIL (pre-existing, unrelated) | 8 rapid-fire socket-based knock admissions race against the `.knock-toast` locator; not one of the swapped assertions; out of scope — see below |
| `v3-mui-meet-ui/meet-ui.spec.ts` — DR-26 "share layout..." (swapped assertion) | **PASS** | |
| `v3-mui-meet-ui/meet-ui.spec.ts` — other 3 tests in file | not exercised for this report | serial-mode file; only the swapped test was targeted per plan |
| `v3-share-camera-cut/share-camera-cut.spec.ts` — DR-53 (swapped assertion present) | BLOCKED (pre-existing, unrelated) | fails earlier, at `senderFor(...)` against `window.__meetDebug.senderSnapshot`, a hook that doesn't exist anywhere in the current codebase (removed post-SFU-cutover). Swap itself never reached. |
| `v3-tilefix/tilefix.spec.ts` — DR-30 (swapped assertion present) | BLOCKED (pre-existing, unrelated) | fails earlier, at `expectMirrored(localVideo,...)` — local camera self-view isn't CSS-mirrored, a pre-existing issue in `effectiveLocalStream()`/`isMirroredSelfView` (tile.component.ts), out of scope per brief ("do not touch camera/self-PIP tiles"). Swap itself never reached. |

## Pre-existing defects discovered and fixed (test-only, mechanical, verified via `git stash`
against baseline where noted)
1. `e2e/fixtures/auth.ts` login button locator ambiguous since a Telegram login button was
   added (commit `1fbc273`, prior week) — **verified pre-existing**: re-ran
   `share-reflow.spec.ts` FIXC3.1 against `git stash`-restored baseline code, same failure.
2. `e2e/fixtures/rooms.ts` `createRoomFromDashboard` clicked a since-removed inline "Open"
   button; the toggle moved into the row's overflow menu.
3. Knock-toast (`.knock-toast-stack`, `position:fixed; top:16px; right:16px`) visually
   overlaps the "Show participants" corner button, blocking the sidebar-based admit flow used
   by 4 specs' helpers — worked around by admitting directly from the toast (which has its own
   inline Admit button) instead of opening the sidebar.
4. `tilefix.spec.ts`'s pre-join camera checkbox locator (`'Start with camera on'`) never
   matched current markup (label text is dynamic — "Camera on"/"Camera off"); fixed + added
   `{force:true}` (the checkbox is visually covered by its own label span, same reason
   `share-camera-cut.spec.ts` already forces this exact control).

## Pre-existing defects discovered and NOT fixed (out of scope for R7 — flagged, not silently
skipped)
1. `share-camera-cut.spec.ts`'s `senderFor()` helper reads `window.__meetDebug.senderSnapshot`,
   which does not exist in `room.page.ts` or `sfu-client.service.ts` (grepped repo-wide, zero
   hits) — this test's WebRTC-sender-probing mechanism appears to predate the SFU cutover and
   was never updated. Fixing would require adding new debug instrumentation to the SFU client,
   explicitly out of scope for this batch.
2. `tilefix.spec.ts` DR-30's camera-self-mirror expectation: `effectiveLocalStream()` always
   returns a non-null stream once the camera is on, which makes `isMirroredSelfView`
   (`!displayStream()`) always false for the grid tile — meaning the local camera view is
   never CSS-mirrored under current code, contradicting the test. This is in
   `tile.component.ts`/`room.page.ts` camera-tile logic, not anything touched by R7, and the
   brief explicitly puts camera/self-PIP tiles out of scope.
3. `v3-fixc3-share-reflow/share-reflow.spec.ts` FIXC3.2: admitting 8 rapid-fire socket guests
   in quick succession sometimes races the knock-toast appearing; not one of the assertions I
   was asked to swap, not touched further.

`tsc --noEmit` on the e2e project has ~60 pre-existing errors across ~10 unrelated spec files
(a stale `MeetDebug` TypeScript interface not kept in sync with `window.__meetDebug`'s actual
shape) — none in files I touched are new; Playwright doesn't type-check at run time (esbuild
transpile-only), so these have never blocked test execution.

## Screenshots
`plan/WK_0701/projcore-run-2026-07-01/batch-SS/screenshots/`
- `presenter-placeholder.png` — local presenter's own view: desktop icon + "You're presenting", no mirror.
- `remote-sees-share.png` — remote guest's view: live "Shared screen" canvas content, animated counter visible.

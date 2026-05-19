---
date: 2026-05-19
project: meet-poc
type: pre-dispatch-revision
source: projcore (synthesizing Codex review + Claude-peer review)
priority: high
search_hooks: [v3-mobile, pre-dispatch, codex-review, claude-peer-review, iOS-autoplay, visibility-state-test-seam, mobile-cap-join-payload, batch-reorder]
---

## Inputs

- **Codex review** (STATUS: REVISE): R8.3 over-specified matrix, Angular SCSS partial mechanics, R1.2/S1.2 mismatch, background-tab promise scope, MediaRecorder capability list, mobile-cap requires `isMobile` metadata on admitted, platform.service.ts to M-B1, viewport-fit=cover, visibilityState test seam.
- **Claude-peer review** (STATUS: REVISE): iOS AudioContext autoplay policy, fake-media facingMode, `mobile:true` in join payload, MediaRecorder timeslice on iOS, M-B7 simultaneous iOS+Android, M-B5 ambiguous edge (mobile joiner w/ 8 desktop), bottom-sheet vs iOS keyboard, orientation handling, calc(100vh) audit, DEFER R4.1+R4.2+R3.2+R6.4, swap M-B5↔M-B3, merge M-B6→M-B1.

## Folded changes

### Scope edits

- **DROP from Run 3, DEFER to v3.5:**
  - R4.1 tap-to-focus-tile (too much state-machine, risks Run 1 B6 grid regression)
  - R4.2 swipe-between-sidebar-tabs (tap-to-switch is the v3 placeholder)
  - R3.2 compact 5-bar mic-meter (pure visual polish; keep 8 bars)
  - R6.4 fullscreen helper (dead code if not used in Run 3)
- **NARROW R1.2** to "controls in lobby + call view + bottom-sheet" (not "every interactive control" — was too broad to cover dashboard CRUD buttons too)
- **REWORD R8.3** — two-axis matrix uses VIEWPORT-SPECIFIC expected assertions (not "same scenario at both viewports"). Mobile intentionally changes behavior in B8 sidebar (bottom-sheet), B7 controls (docked), B6 grid, screen-share (hidden). The matrix asserts the mobile-expected mobile behavior + the desktop-expected desktop behavior — both correct in their viewport.
- **REWORD R5.3** — "best-effort" video pause on background; do not promise WS keepalive. iOS throttles backgrounded tabs; promise what is reliable.

### Adds to Run 3 scope

- **R1.6 (new):** `viewport-fit=cover` meta tag in index.html (or already implicit via Angular CLI default — verify). Required for iOS safe-area-inset to work.
- **R1.7 (new):** Angular SCSS `_breakpoints.scss` accessibility — either `angular.json` `stylePreprocessorOptions.includePaths` adds the partial folder, OR every component SCSS that uses the mixin has an explicit `@use 'breakpoints' as bp;` at top. Codex picks + logs.
- **R5.5 (new — replaces UA-only):** Client-declared `mobile: true` in the WS `join` payload as **primary** signal. UA regex is **secondary audit only**. Backend stores `isMobile` boolean on `PeerEntry` at admit time (must be added to the entry struct). Cap check happens in `join` MESSAGE handler (after admission decision), NOT in WS upgrade handler.
- **R6.6 (new):** MediaRecorder mime capability list — codex iterates `['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']` (or similar), picks the first `isTypeSupported`. Upload/list/download paths accept `.mp4` filenames in addition to `.webm`. `X-Ext` header reflects the actual codec extension.
- **R6.7 (new):** Orientation handling — at minimum a graceful landscape layout (don't require portrait lock; the call grid already handles landscape via the existing CSS, just verify it's not broken). M-B7 includes a landscape smoke.
- **M-B2 new edge:** Bottom-sheet over iOS virtual keyboard — use `window.visualViewport.height` to position the sheet, or close the sheet when a focusable input gets focus inside it. Document codex's pick.
- **M-B7 add:** Real-device iOS↔Android SIMULTANEOUS call (not OR with desktop). The SDP/codec negotiation between two real mobile platforms is the failure mode that only Run 3 introduces and only real-device exposes.
- **M-B5 edge clarified:** Mobile joiner attempts to join a room already at 8 admitted (mostly desktop). Per locked decision "per-client cap of 4", a 9th mobile peer is rejected (room is at 8 overall, regardless of platform mix). Add this as an explicit S5.x scenario.
- **iOS AudioContext autoplay (Claude-peer's biggest catch):** `MediaService.getMicLevel` defer creating `AudioContext` until first user-gesture. Lobby strategy: show meter as "Tap to enable mic preview" pill until user taps; on tap, create AudioContext + resume() inside the gesture handler. Desktop Chrome doesn't need this (auto-grants); mobile + iOS Safari does. Add to R3.x and M-B4 (mobile lobby) brief.
- **visibilityState test seam:** S5.4 specifies `Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })` BEFORE dispatching `visibilitychange` event. Production code path reads `document.visibilityState`; the test seam makes it return 'hidden' for the duration of the assertion.
- **facingMode test assertion:** S3.2 asserts `__meetDebug.lastVideoConstraints.facingMode === 'environment'` (the constraint OBJECT passed) — NOT track-ID flip (fake-media regenerates tracks regardless).
- **MediaRecorder timeslice on iOS:** when iOS Safari detected (M-B6 platform.service), `MediaRecorder.start()` is called WITHOUT a timeslice argument (or with `>= 1000ms`). Add to R6.x.

### Batch reorder + merge

OLD: M-B1 → M-B2 → M-B3 → M-B4 → M-B5 → M-B6 → M-B7

NEW (locked): M-B1 → M-B2 → M-B3 → M-B4 → M-B5 → M-B6

- **M-B1 (Foundations):** 100dvh + calc(100vh-...) audit, 48px (narrowed scope), breakpoint partial + Angular includePaths/imports, `isMobile()` signal, **platform.service.ts (isIOS + isAndroid) moved here**, viewport-fit=cover audit
- **M-B2 (WebRTC adjustments) [was M-B5; swapped early per Claude-peer]:** mobile 480p constraints, **client-declared `mobile:true` in join payload + backend `isMobile` on PeerEntry**, mobile cap of 4 enforced in `join` handler, background-tab best-effort pause, S5.x edge for mobile-joiner-with-8-desktop
- **M-B3 (Mobile call layout) [was M-B2; renumbered]:** bottom-sheet + docked controls + mobile grid + screen-share-hidden + iOS-keyboard handling for bottom-sheet + tap-to-switch placeholder for swipe-tabs
- **M-B4 (Mobile lobby) [was M-B3; renumbered]:** camera switch (facingMode), single-column selectors, **AudioContext gesture-gated mic-meter activation** (the Claude-peer catch). Drop 5-bar variant (R3.2 deferred).
- **M-B5 (iOS specifics) [was M-B6; renumbered]:** MediaRecorder capability-list mime fallback, timeslice ≥ 1000ms on iOS, orientation graceful landscape. Drop fullscreen helper (R6.4 deferred).
- **M-B6 (Real-device acceptance) [was M-B7; renumbered]:** operator iPhone + Android SIMULTANEOUS smoke (not OR with desktop), Lighthouse, real 2-min call, comparison screenshots, JROM sign-off

~~M-B4 touch interactions~~ DROPPED — its scope absorbed into M-B3 (tap-to-switch tabs in bottom-sheet) and deferred (tap-to-focus, swipe-tabs).

### Result

- **6 batches not 7** (one merged out)
- **30 reqs** (was 33; -3 for defers, +2 for adds, net -3 + small renumbering)
- ~25 scenarios (was ~32, drops from defers, adds from edges)

### Promotion candidates (for /jweek if these recur)

- "Client-declared platform signals beat server-side UA detection" — applies broadly
- "AudioContext on iOS requires user gesture before resume" — known iOS quirk worth a project rule
- "Two-axis viewport matrices need viewport-specific expected assertions, not same-test-at-both" — applies to any responsive run

### What I'd surface to JROM (per directive, NOT a question — just transparency)

JROM said no more questions during Run 3. So I don't ask. But the deferrals (tap-to-focus, swipe-tabs, fullscreen helper) are scope reductions JROM might want to know about. /projcore will surface them in the Phase 2 hand-back.

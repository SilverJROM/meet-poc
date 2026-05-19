# scenarios.md — meet-poc v3 mobile UI/UX

Owned by /projcore. Each scenario maps to R#s in og-requirements.md.

Per JROM directive 2026-05-19 (regression discipline): every M-B* scenario also implicitly has a "desktop unaffected" peer assertion via the **full Run 1 e2e regression at every gate**. That's enforced via §1.10 Gate 4 (test pass) — not duplicated in this file as separate scenarios.

Mobile-viewport scenarios run at 390×844 (iPhone 14 portrait). Desktop-unaffected scenarios run at 1920×1080.

---

## M-B1 — Mobile foundations

### S1.1 — All `100vh` migrated to `100dvh` [R1.1]
- **Given** the post-Run-1 frontend tree
- **When** `grep -rE "100vh" frontend/src/app/**/*.scss frontend/src/styles.scss` (or `git diff` introduced files)
- **Then** zero matches OR every match is paired with a `100dvh` fallback line (`min-height: 100vh; min-height: 100dvh;`)
- **Proof:** static file scan in CI / changes.md cite

### S1.2 — 48×48 px touch-target audit at mobile viewport [R1.2]
- **Given** Playwright launched at 390×844 viewport
- **When** every interactive control on the call view (mic, cam, leave, record-if-host, sidebar toggle, kebab buttons) is measured via `boundingBox()`
- **Then** each has `width >= 48 AND height >= 48`
- **Proof:** Playwright spec walking the controls

### S1.3 — Breakpoint system formalized [R1.3]
- **Given** `frontend/src/styles/_breakpoints.scss` (or equivalent)
- **When** the file is read
- **Then** it defines `$mobile-max: 1023px` + `$desktop-min: 1024px` + mixins for media-query helpers
- **And** `grep -rE "@media.*(\d+px|\d+em)" frontend/src/app/**/*.scss` returns zero RAW media queries (all go through the partial)
- **Proof:** static file check + grep audit

### S1.4 — `isMobile()` signal works + debounced [R1.4]
- **Given** Angular app booted at viewport 1920×1080
- **When** `__meetDebug.isMobile()` is read via `page.evaluate`
- **Then** returns `false`
- **When** viewport resized to 390×844 + 300ms wait
- **Then** `__meetDebug.isMobile()` returns `true`
- **Proof:** Playwright with `page.setViewportSize` + window debug hook

### S1.5 — Desktop default behavior preserved [R1.5 + R8.1]
- **Given** Playwright at 1920×1080 (desktop viewport)
- **When** the full v2 Run 1 e2e suite (`tests/v2-b3-shell` + `v2-b4-tabs` + `v2-b5-lobby` + `v2-b6-grid` + `v2-b7-controls` + `v2-b8-sidebar`) runs against the post-M-B1 build with `--workers=1`
- **Then** all 40 tests PASS (no regressions)
- **Proof:** Playwright reruns

## M-B2 — Mobile call layout

### S2.1 — Bottom-sheet replaces sidebar on mobile [R2.1]
- **Given** Playwright at 390×844, host in a call with 1 admitted guest
- **When** click sidebar toggle in the docked controls bar
- **Then** bottom-sheet slides up, covers ~75% viewport height, shows "In the call" + "Waiting to join" sections
- **When** swipe down (Playwright `page.touchscreen.swipe` from top to bottom)
- **Then** bottom-sheet dismisses
- **Proof:** Playwright two-context mobile viewport

### S2.2 — Bottom-sheet NOT shown on desktop [R2.1 + R8.2]
- **Given** Playwright at 1920×1080
- **When** sidebar toggle clicked
- **Then** right-side `<app-participant-sidebar>` (the Run 1 B8 component) slides in, NOT a bottom sheet
- **And** no bottom-sheet element rendered in the DOM
- **Proof:** Playwright + class assertions

### S2.3 — Mobile controls bar docked at bottom [R2.2]
- **Given** Playwright at 390×844, in-call state
- **When** controls-bar element's `boundingBox()` is read
- **Then** `y + height` is within 24px of the viewport bottom (allows for safe-area-inset padding)
- **Proof:** Playwright

### S2.4 — Desktop controls bar unchanged [R2.2 + R8.2]
- **Given** Playwright at 1920×1080
- **When** controls-bar position measured
- **Then** matches Run 1 B7 baseline (top of call panel, not bottom-docked)
- **Proof:** Playwright

### S2.5 — Mobile grid 1-peer full-screen [R2.3]
- **Given** Playwright at 390×844, owner alone in call
- **When** tile bounding box measured
- **Then** width ~= viewport width AND height covers most of the viewport (leaving controls bar + safe-area)
- **Proof:** Playwright

### S2.6 — Mobile grid 2-peer vertical stack [R2.3]
- **Given** Playwright at 390×844, two-context two-peer call
- **When** tile bounding boxes measured
- **Then** two tiles stacked vertically (tile1.y + tile1.height ≈ tile2.y), each ~50% of available height
- **Proof:** Playwright two-context mobile

### S2.7 — Screen-share button hidden on mobile [R2.4]
- **Given** Playwright at 390×844, in-call
- **When** controls bar inspected
- **Then** screen-share button has `toHaveCount(0)`
- **Proof:** Playwright

### S2.8 — Screen-share button visible on desktop [R2.4 + R8.4]
- **Given** Playwright at 1920×1080, in-call
- **When** controls bar inspected
- **Then** screen-share button is visible
- **Proof:** Playwright

## M-B3 — Mobile lobby

### S3.1 — Camera switch button visible on mobile, hidden on desktop [R3.1]
- **Given** lobby preview at 390×844 with camera on
- **When** `<app-lobby-preview>` inspected
- **Then** a "Flip camera" / "Switch camera" icon button is visible
- **When** viewport switched to 1920×1080
- **Then** the same button has `toHaveCount(0)` (or `not.toBeVisible()`)
- **Proof:** Playwright at both viewports

### S3.2 — Camera switch triggers `facingMode` change [R3.1]
- **Given** Playwright at 390×844 with `__meetDebug` exposing `media.currentFacingMode`
- **When** "Flip camera" button clicked
- **Then** `__meetDebug.currentFacingMode` flips from `'user'` to `'environment'` (or vice versa)
- **And** `MediaService.reacquire` was called (verified via spy or by track-ID change)
- **Proof:** Playwright + window debug hook

### S3.3 — Compact mic-meter shows 5 bars on mobile [R3.2]
- **Given** Playwright at 390×844, lobby with fake mic
- **When** mic-meter DOM is inspected
- **Then** exactly 5 `.bar` elements are rendered (vs 8 on desktop)
- **Proof:** Playwright

### S3.4 — Desktop mic-meter still 8 bars [R3.2 + R8.2]
- **Given** Playwright at 1920×1080, lobby
- **When** mic-meter DOM inspected
- **Then** 8 `.bar` elements rendered
- **Proof:** Playwright

### S3.5 — Lobby device selectors single-column on mobile [R3.3]
- **Given** Playwright at 390×844, lobby
- **When** mic + camera selectors inspected
- **Then** they stack vertically (mic selector's `y + height < camera selector's y`)
- **Proof:** Playwright

## M-B4 — Touch interactions

### S4.1 — Tap-to-focus-tile promotes tile [R4.1]
- **Given** Playwright at 390×844, two-context two-peer call
- **When** owner taps the guest's tile
- **Then** guest's tile becomes "primary" (full-width, larger), owner's tile docks as a smaller thumbnail at the bottom strip
- **Proof:** Playwright two-context

### S4.2 — Tap primary tile returns to grid [R4.1]
- **Given** primary tile state from S4.1
- **When** tap the primary tile
- **Then** layout returns to the 2-peer vertical stack
- **Proof:** Playwright two-context

### S4.3 — Desktop tap behavior unchanged [R4.1 + R8.2]
- **Given** Playwright at 1920×1080, two-peer call
- **When** click a tile
- **Then** no layout change; grid stays as 2-tile split
- **Proof:** Playwright two-context

### S4.4 — Swipe between sidebar tabs (host only) [R4.2]
- **Given** Playwright at 390×844, host opens bottom-sheet (showing "In the call" by default)
- **When** swipe left (touchscreen gesture)
- **Then** sidebar switches to "Waiting to join" section
- **When** swipe right
- **Then** sidebar switches back to "In the call"
- **Proof:** Playwright touchscreen API

### S4.5 — Swipe not present for non-host [R4.2]
- **Given** Playwright at 390×844, guest opens bottom-sheet (only "In the call" section visible — no waiting section for non-hosts)
- **When** swipe gestures applied
- **Then** no section change happens (no swipe handler attached)
- **Proof:** Playwright two-context

## M-B5 — Mobile WebRTC adjustments

### S5.1 — Mobile preflight requests 480p [R5.1]
- **Given** Playwright at 390×844, lobby mounted
- **When** `MediaService.preflight` is called (eagerly on lobby mount)
- **Then** `__meetDebug.lastVideoConstraints` contains `{ideal: 854, max: 854}` for width AND `{ideal: 480, max: 480}` for height
- **Proof:** Playwright + window debug hook

### S5.2 — Desktop preflight requests default (720p) [R5.1 + R8.4]
- **Given** Playwright at 1920×1080
- **When** preflight runs
- **Then** `__meetDebug.lastVideoConstraints` does NOT cap at 480p — uses 720p+ default
- **Proof:** Playwright + window debug hook

### S5.3 — Mobile cap = 4 mobile peers via UA detection [R5.2]
- **Given** 4 mobile peers already admitted to a room (via 4 ephemeral `ws` clients with mobile UA in headers)
- **When** a 5th client with mobile UA attempts `join`
- **Then** receives `{type:'error', error:'mobile room full (4 max)'}` + socket closes
- **And** a 5th client with DESKTOP UA can join (subject to total 8-cap)
- **Proof:** backend vitest with ws-client harness using custom UA headers + supertest

### S5.4 — Background-tab pauses local video on mobile [R5.3]
- **Given** Playwright at 390×844, in-call with camera on
- **When** simulate `document.visibilityState = 'hidden'` (Playwright `page.evaluate` to dispatch the event)
- **Then** local video track `enabled` becomes false within 1s
- **And** a `media-state {cam: false}` WS broadcast was sent (verified via second-context observer)
- **When** dispatch `visible` event back
- **Then** local video track re-enables + `media-state {cam: true}` broadcast
- **Proof:** Playwright two-context

### S5.5 — Background-tab on desktop does NOT pause video [R5.3 + R8.4]
- **Given** Playwright at 1920×1080, in-call with camera on
- **When** dispatch `visibilitychange hidden`
- **Then** local video track stays enabled (no behavior change)
- **Proof:** Playwright

## M-B6 — iOS Safari specifics

### S6.1 — `platform.service.ts` exposes `isIOS()` + `isAndroid()` signals [R6.1]
- **Given** Playwright with iOS UA override
- **When** `__meetDebug.isIOS()` read
- **Then** returns `true`; `__meetDebug.isAndroid()` returns `false`
- **And** at Android UA, opposite
- **Proof:** Playwright with `userAgent` browser-context option

### S6.2 — `MediaRecorder` mime fallback [R6.3]
- **Given** Playwright with `MediaRecorder.isTypeSupported` stubbed to return `false` for `audio/webm`
- **When** recording starts
- **Then** the MediaRecorder is constructed with `mimeType: 'audio/mp4'` (or whatever supported fallback)
- **And** the uploaded file's `X-Ext` header reflects the actual codec (`.mp4` if mp4)
- **Proof:** Playwright + stub + filesystem inspection

### S6.3 — Fullscreen helper has webkit fallback [R6.4]
- **Given** the new fullscreen helper utility
- **When** code inspection (no Run 3 component triggers fullscreen; just verify the helper exists + handles both APIs)
- **Then** the helper checks `element.requestFullscreen` THEN `element.webkitRequestFullscreen`
- **Proof:** static code read

### S6.4 — iOS Safari layout doesn't clip (real device) [R6.5 + R7.1]
- **Given** operator-assisted iPhone 14 + Safari at voice.silverjrom.app
- **When** address bar collapses on scroll
- **Then** no content clipped, controls bar still visible
- **Proof:** real-device acceptance + screenshot

## M-B7 — Real-device acceptance

(All R7.* are operator-assisted. Scenarios documented for transparency; no Playwright automation possible.)

### S7.1 — Real iPhone 14 Safari smoke [R7.1]
- Operator opens voice.silverjrom.app; logs in; verifies all 8 navigation tabs visible (Rooms, Ongoing, Past, Recordings, Transcripts-stub, Settings-stub); visits TEST_ROOM01; sees mobile lobby preview with Flip camera button; joins; sees mobile in-call layout (controls docked bottom); opens bottom-sheet; backgrounds the tab; comes back. All pass JROM smoke.

### S7.2 — Real Android Chrome smoke [R7.1]
- Same as S7.1 on Android.

### S7.3 — Lighthouse mobile audit [R7.2]
- Operator runs Lighthouse mobile emulation against voice.silverjrom.app/app/rooms. Captures: accessibility, performance, best-practices scores. Targets: ≥85 / ≥70 / ≥85. Failure below = flag in report, not auto-blocker.

### S7.4 — Real 2-minute call between two devices [R7.3]
- Two real devices (or one device + desktop) join the same room; audio + video flow; record 30s; verify recording lands in dashboard; stop; both leave gracefully.

### S7.5 — Side-by-side comparison screenshots [R7.4]
- Mobile + desktop screenshots of: Rooms, Dashboard, Call lobby, In-call grid. Captured by operator.

---

## Cross-batch quality gates

- §2.10 validator discipline: every Playwright spec uses real DOM via `page.goto` / `page.click` / `page.locator`; NO `page.setContent` smell.
- §2.10a per-module targeted iteration; full e2e is sanity check only.
- **Run 1 desktop e2e regression at every M-B* gate (R8.1 — non-negotiable).**
- Tests clean up rooms/sessions/recordings they create (hygiene rule carried from v2).

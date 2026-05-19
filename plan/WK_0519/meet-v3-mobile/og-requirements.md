# og-requirements.md — meet-poc v3 mobile UI/UX (Run 3)

**Locked:** 2026-05-19 by JROM via two intake rounds (initial v2-B2-parallel + post-Run-1 regression-discipline append). All architectural + UX decisions are LOCKED — **no further questions to be asked during Run 3** per JROM directive.
**Mode:** autonomous-complete; JROM-validated final smoke + real-device acceptance.
**Predecessor:** `plan/WK_0519/meet-v2/og-requirements.md` (44/44 VERIFIED + Phase 2 ACCEPT). All v2 reqs remain in force as the desktop baseline; mobile adds on top.

**This is the contract.** Final acceptance only when every row of `req-matrix.md` reads VERIFIED + the two-axis viewport matrix (1920×1080 desktop + 390×844 iPhone 14 portrait) passes at Phase 2.

---

## Scope statement

Add a mobile UI/UX layer to the existing meet-poc app at `~/websites/meet-poc/`, served live at `https://voice.silverjrom.app`. Fluid responsive single SPA — same Angular routes, breakpoint-driven mobile UI swaps via CSS media queries + signal-driven layout conditionals. **No PWA install layer. No `/m/*` route tree.** Desktop functionality (all 44 v2 reqs) MUST remain identical on viewports ≥ 1024px.

**In scope:** viewport-units migration, 48px touch targets, breakpoint system + `isMobile()` signal, bottom-sheet replacing the desktop sidebar on mobile, docked bottom controls, dynamic-grid mobile variants, mobile lobby polish (camera switch + compact meter), touch interactions (tap-to-focus-tile + swipe-between-sidebar-tabs), mobile WebRTC compromises (480p / 4-peer cap), iOS Safari quirk handling, real-device acceptance.

**Out of scope (deferred to v3.5+):** PWA install + service worker, pinch-to-zoom-tile, double-tap-to-pin, reactions/raise-hand, mobile-specific transcripts UX (Run 2's job), connection-quality-dot per tile, mid-call device-change handling beyond what v2-B7 already covers, mobile-specific recording controls (mobile recording stays as it is in v2 — host can record, soft-warn battery cost in v3.5 if desired).

**Out of Run 3 (Run 2 territory):** Whisper.cpp pipeline, Transcripts tab, Settings tab. Those land in Run 2 and are orthogonal to mobile.

---

## R1 — Mobile foundations

- **R1.1** All `min-height: 100vh` (and any `height: 100vh`) usages in `frontend/src/app/**/*.scss` migrate to `100dvh` with a `100vh` fallback line where helpful. Audit every occurrence; none remain unresolved post-batch. iOS Safari's address bar collapse/expand must not clip content.
- **R1.2** Every interactive control (buttons, links acting as buttons, icon controls, kebab menus, sidebar toggles) passes a 48×48 px hit-test on mobile breakpoint. Desktop unchanged (current sizes preserved). Verified via Playwright `boundingBox()` assertions.
- **R1.3** Responsive breakpoint system formalized in a shared SCSS partial (`frontend/src/styles/_breakpoints.scss` or similar) with named mixins / variables: `$mobile-max: 1023px`, `$desktop-min: 1024px`. All new media queries use these (audit existing media queries too).
- **R1.4** `isMobile()` signal exposed by a new `frontend/src/app/services/viewport.service.ts` (or `core/viewport.signal.ts`): `signal<boolean>` based on `window.innerWidth < 1024`. Updates on debounced `resize` (250ms debounce). Default value computed eagerly at boot. Used as a single source of truth — components consume the signal, never read `window.innerWidth` directly.
- **R1.5** `isMobile()` defaults to FALSE for desktop-class viewports — desktop UX is the default; mobile UX is the opt-in path. Components MUST NOT introduce regressions when `isMobile() === false`.

## R2 — Mobile call layout

- **R2.1** When `isMobile() === true` in the call state, `<app-participant-sidebar>` (Run 1 B8) is REPLACED by a bottom-sheet UI — slides up from the bottom on toggle, ~75% viewport height, swipe-down (or tap-outside) to dismiss. Same content (admitted peers, knockers section for host). Same actions (kebab Mute/Remove). Desktop sidebar UNCHANGED.
- **R2.2** Mobile controls bar docks at the bottom of the viewport with safe-area-inset padding (iOS notch / home indicator). Centered icon row. Same icons (mic, cam, leave, plus host-only record), `aria-pressed` preserved. Desktop controls bar UNCHANGED.
- **R2.3** Dynamic grid mobile variants:
  - 1 peer: full-screen tile (object-fit:cover) with safe-area-inset top/bottom margins; meeting clock overlaid top-left
  - 2 peers: vertical stack 50/50
  - 3-4 peers: 2×2 grid (same as desktop)
  - Mobile cap is 4 admitted peers (R5.2) — grid never needs to handle more
  Desktop grid CSS (Run 1 B6) UNCHANGED for `isMobile() === false`.
- **R2.4** Screen-share button is HIDDEN on `isMobile() === true` (Run 3 locked decision). Desktop still shows it. Verified via `toHaveCount(0)` on mobile viewport AND `toBeVisible()` on desktop viewport.
- **R2.5** Mute icon overlay + camera-off avatar + HOST badge (per-tile overlays from v2-B6) work identically on mobile tiles.

## R3 — Mobile lobby

- **R3.1** Camera switch button in the lobby preview: a small "Flip camera" icon button that toggles `facingMode: 'user' | 'environment'` for the active video device. Visible only on `isMobile() === true`. Re-acquires `getUserMedia` with new constraints. Desktop unchanged.
- **R3.2** Compact mic-meter on mobile: 5 bars instead of 8 (visual density tweak), same 8 Hz cadence. Identical behavior + signal source on desktop (8 bars stays).
- **R3.3** Single-column lobby device selectors on mobile (vs side-by-side desktop). Larger tap targets per R1.2.

## R4 — Touch interactions

- **R4.1** Tap-to-focus-tile: on mobile, tapping a NON-SELF tile in the call view promotes it to a "primary" full-screen view; other tiles dock as a thumbnail strip at the bottom (above the controls bar). Tap the primary tile to return to grid. Desktop unaffected (no tap behavior change).
- **R4.2** Swipe-between-sidebar-tabs: when the bottom-sheet is open, swipe-left/right between "In the call" and "Waiting to join" sections (host only — guest has only one section). Uses a touch event handler with horizontal-swipe-threshold detection. Desktop unaffected (no swipe behavior; both sections always stacked vertically in the right-side panel).
- **R4.3** Pinch-to-zoom-tile and double-tap-to-pin DEFERRED to v3.5 (documented).

## R5 — Mobile WebRTC adjustments

- **R5.1** Default video resolution on mobile = **480p** (constraint: `{video: {width: {ideal: 854, max: 854}, height: {ideal: 480, max: 480}}}`). Desktop unchanged (720p current behavior). Applied at lobby preflight + reacquire.
- **R5.2** Mobile peer cap = **4** enforced per-client via UA detection on WS `join`:
  - Backend detects mobile via `req.headers['user-agent']` regex match for iOS/Android UA strings (`/(iPhone|iPad|iPod|Android)/i`)
  - On `join` from a mobile client: if `live.admitted` already contains 4+ mobile peers, send `{type:'error', error:'mobile room full (4 max)'}` + close socket
  - Desktop joiners are still capped at 8 (Run 1 R3.8). A mixed room can have 4 mobile + 4 desktop = 8 total.
  - Documented limitation: UA detection is imperfect. A desktop-spoofed-as-mobile or vice versa can bypass; this is acceptable for single-user app — soft warning toast surfaces if cap is reached.
- **R5.3** Background-tab handling: on `document.visibilityState === 'hidden'` while in-call:
  - Pause local video track (`track.enabled = false`) — preserves audio
  - Broadcast `{type:'media-state', mic: <current>, cam: false}` so peers see avatar
  - On `visible` again: re-enable video (if it was on before backgrounding) + broadcast new state
  - Mobile-only behavior (`isMobile() === true`). Desktop ignores `visibilityState` changes (current behavior preserved).
- **R5.4** Adaptive auto-downgrade via `RTCPeerConnection.getStats()` is OUT OF SCOPE for Run 3 (v3.5 candidate). Static 480p is the contract.

## R6 — iOS Safari specifics

- **R6.1** New `frontend/src/app/services/platform.service.ts` (or similar): exports `isIOS()`, `isAndroid()` UA-based detection signals. Used by other services + components for conditional behavior.
- **R6.2** `getDisplayMedia` (screen share) — already hidden on `isMobile()` via R2.4. Also guard backend or client path: if a mobile UA calls `getDisplayMedia` via dev tooling, gracefully reject with a clear error. ✓ Already implicit if R2.4 holds.
- **R6.3** `MediaRecorder` mime fallback on iOS: iOS Safari historically lacks `audio/webm;codecs=opus` support; recordings should fall back to `audio/mp4` if `MediaRecorder.isTypeSupported('audio/webm;codecs=opus') === false`. The resulting `.webm`-or-`.mp4` file extension matches the actual codec in the saved filename (B5 already accepts `X-Ext` header — codex uses it correctly).
- **R6.4** Fullscreen API: any "expand tile to fullscreen" interaction (future v3.5 or if introduced via tap-to-focus) uses `requestFullscreen` with `webkitRequestFullscreen` fallback for iOS Safari. Run 3 itself doesn't introduce fullscreen but the helper is added.
- **R6.5** `100dvh` (R1.1) implicitly covers iOS Safari's biggest layout quirk. Confirm via real-device acceptance (R7.x) that address bar collapse/expand doesn't clip.

## R7 — Real-device acceptance

- **R7.1** Operator-assisted real-device test pass: JROM (or operator) opens `https://voice.silverjrom.app` on a real iPhone 14+ in Safari AND a real Pixel/Android in Chrome. For each device:
  - Log in successfully
  - Open the dashboard, navigate the 4 tabs
  - Visit a room, see the mobile lobby preview, switch camera (R3.1), join
  - In-call: verify dynamic grid 1-peer / 2-peer (would need a 2nd device or desktop friend)
  - Open bottom-sheet sidebar (R2.1)
  - Confirm controls bar is bottom-docked (R2.2)
  - Background the tab, come back — call still active, video paused gracefully (R5.3)
- **R7.2** Lighthouse mobile audit (run from operator's desktop Chrome with mobile emulation): accessibility ≥ 85, performance ≥ 70, best-practices ≥ 85. Targets are reasonable for single-user app; report failure modes if below.
- **R7.3** A real 2-minute call between two real devices (or one device + desktop), with both audio + video flowing. Operator confirms.
- **R7.4** Comparison screenshots: mobile + desktop side-by-side for the same page (Rooms, Dashboard, Call lobby, In-call grid). Operator captures.
- **R7.5** Final JROM smoke + sign-off.

## R8 — Regression discipline (carried from plan appendix)

- **R8.1** Every M-B* batch runs the FULL Run 1 desktop e2e suite (`tests/v2-b3-shell` + `v2-b4-tabs` + `v2-b5-lobby` + `v2-b6-grid` + `v2-b7-controls` + `v2-b8-sidebar`) before posting `STATUS: DONE`. Any single desktop spec failure = batch FAIL.
- **R8.2** Every M-B* batch that touches shared CSS / shared services / shared components gets a paired "desktop unaffected" Playwright spec asserting the desktop layout still works at viewport 1920×1080.
- **R8.3** Phase 2 final acceptance runs the two-axis viewport matrix: every B3–B8 + M-B1–M-B6 scenario re-runs at BOTH 1920×1080 (desktop) AND 390×844 (iPhone 14 portrait). Both must be green for ACCEPT.
- **R8.4** WebRTC compromises (480p / 4-cap) MUST NOT apply to desktop. Verified by a desktop spec checking `getUserMedia` constraints at desktop viewport remain 720p (or whatever desktop default).
- **R8.5** CSS regression screenshots per M-B*: `batch-<n>/screenshots/desktop-regression/` folder with comparison shots at 1920×1080 for each major page (rooms, ongoing, past, recordings, lobby, in-call grid).

---

## Open clarifications (none blocking — all defaults locked from plan appendix)

| # | Question | Default applied |
|---|----------|-----------------|
| Q1 | Bottom-sheet open height | 75% of viewport (covers most content, leaves call view visible at top) |
| Q2 | Bottom-sheet drag-to-resize | Out of scope (v3.5); fixed-height with swipe-down-to-close only |
| Q3 | Mobile peer count beyond 4 — what happens to non-mobile peers in a mixed room? | Mobile cap is per-client only. Desktop joiners can still join up to 8 total. UA-spoof risk acknowledged. |
| Q4 | iOS Safari 15 support? | NO — iOS 16+ only (locked at intake) |
| Q5 | Camera switch button placement | Inside `<app-lobby-preview>` near the camera selector; icon only |
| Q6 | Lighthouse failure → block run? | Below targets is a flag, not a blocker (single-user app; codex can document + JROM decides) |

No JROM questions during Run 3 per directive. Codex makes autonomous calls per §1.15.

# req-matrix.md — meet-poc v3 mobile Run 3 (REVISED post-consult)

Status meanings: `ASSIGNED` → `IN-PROGRESS` → `CLAIMED` → `VERIFIED` (or `FAIL`).

**Post-consult revisions:** `decisions/2026-05-19-v3-pre-dispatch-revisions.md` supersedes any contradictions with the original og-requirements.md.

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|-----------------------------|-------|----------|--------|
| R1.1 | All 100vh + calc(100vh-...) migrated to 100dvh w/ fallback | M-B1 | M-B1 100vh+calc(100vh-...) paired with 100dvh fallback; audit table in changes.md; 8 sites across 4 files | VERIFIED |
| R1.2 | Lobby+call+sidebar interactive controls ≥ 48×48 px on mobile | M-B1 | M-B1 narrowed scope (lobby+call+sidebar) 48px via bp.mobile mixin; M1.3 spec PASS | VERIFIED |
| R1.3 | Breakpoint system formalized in shared SCSS partial | M-B1 | M-B1 frontend/src/styles/_breakpoints.scss with $mobile-max/$desktop-min + mobile/desktop/max/between mixins | VERIFIED |
| R1.4 | isMobile() signal in viewport.service.ts; debounced resize | M-B1 | M-B1 viewport.service.ts isMobile signal w/ 250ms debounce; __meetDebug.isMobile(); M1.2 spec PASS | VERIFIED |
| R1.5 | isMobile() defaults to false; desktop unchanged | M-B1 | M-B1 M1.4 spec confirms desktop layout preserved + no mobile-only leaks at 1920×1080 | VERIFIED |
| R1.6 | viewport-fit=cover meta tag audit (iOS safe-area-inset) | M-B1 | M-B1 index.html viewport meta updated to include viewport-fit=cover | VERIFIED |
| R1.7 | Angular SCSS partial accessible (includePaths or @use pattern) | M-B1 | M-B1 angular.json stylePreprocessorOptions.includePaths=["src/styles"]; per decisions/2026-05-19-v3-mb1-scss-includepaths.md | VERIFIED |
| R1.8 | platform.service.ts isIOS()+isAndroid() signals (moved from M-B6) | M-B1 | M-B1 platform.service.ts isIOS()+isAndroid()+isMobileUA() signals (moved from M-B6 per Codex review) | VERIFIED |
| R5.1 | Mobile preflight requests 480p; desktop unchanged 720p+ | M-B2 | M-B2 MediaService branches on isMobile(); mobile=854x480 max constraint; __meetDebug.lastVideoConstraints; S5.1 PASS | VERIFIED |
| R5.2 | Mobile peer cap=4 via client-declared mobile:true in join payload | M-B2 | M-B2 client-declared mobile:true in join payload (PRIMARY); cap=4 enforced in join MSG handler; backend isMobile metadata on PeerEntry | VERIFIED |
| R5.3 | Background-tab BEST-EFFORT pauses local video; keeps audio (mobile) | M-B2 | M-B2 mobile-only visibilitychange listener; hidden→track.enabled=false+broadcast cam:false; visible→restore. Desktop unaffected (S5.5). | VERIFIED |
| R5.5 | Mobile joiner at 8-cap is rejected (per-client cap + global cap stack) | M-B2 | M-B2 cap-stacking table verified: 4 mobile + 4 desktop = 8 admitted; 9th any-platform → room full (max 8) | VERIFIED |
| R5.6 | Backend isMobile metadata on PeerEntry; cap check in join handler | M-B2 | M-B2 PeerEntry.isMobile metadata; mobile cap check uses live.admitted filter; signaling-mobile-cap.test.ts 2/2 | VERIFIED |
| R2.1 | Bottom-sheet replaces sidebar on mobile (75vh); desktop unchanged | M-B3 | M-B3 participant-sidebar extended w/ mobile mode: 75dvh sheet + backdrop + drag-handle + swipe-down; desktop sidebar unchanged | VERIFIED |
| R2.2 | Mobile controls bar docked bottom w/ safe-area-inset | M-B3 | M-B3 bp.mobile docks controls-bar bottom+safe-area; desktop controls preserved at top | VERIFIED |
| R2.3 | Dynamic grid mobile variants (1=full / 2=vstack / 3-4=2x2) | M-B3 | M-B3 mobile grid variants 1=full, 2=vstack, 3-4=2x2; desktop grid unchanged | VERIFIED |
| R2.4 | Screen-share button hidden on mobile (visible on desktop) | M-B3 | M-B3 screen-share button @if(!isMobile()) — toHaveCount(0) on mobile; visible on desktop | VERIFIED |
| R2.5 | Per-tile overlays work identically on mobile tiles | M-B3 | M-B3 tile.scss mobile sizing guards; overlays remain readable at compact sizes | VERIFIED |
| R2.6 | Bottom-sheet handles iOS virtual keyboard (visualViewport or auto-close) | M-B3 | M-B3 iOS keyboard handling: sheet auto-closes when input inside it receives focus (codex choice: close-on-focus simpler than visualViewport repositioning) | VERIFIED |
| R2.7 | Tap-to-switch sidebar sections (placeholder for swipe; v3.5) | M-B3 | M-B3 tap-to-switch sections via local activeSection signal in sidebar (host only); replaces deferred swipe-tabs | VERIFIED |
| R3.1 | Camera switch button (facingMode) mobile-only; constraint-object asserted | M-B4 | M-B4 Flip camera icon button mobile-only; facingMode constraint asserted on __meetDebug.lastVideoConstraints | VERIFIED |
| R3.3 | Single-column lobby device selectors on mobile | M-B4 | M-B4 lobby-preview SCSS bp.mobile single-column selectors w/ 48px targets | VERIFIED |
| R3.4 | iOS AudioContext gesture-gated mic-meter activation (Claude-peer catch) | M-B4 | M-B4 MediaService.activateMicPreview() defers AudioContext+resume() to first user gesture (mobile only); desktop auto-starts unchanged; __meetDebug.audioContextActivated; pill UX | VERIFIED |
| R6.3 | MediaRecorder mime capability-list fallback; upload/download accept .mp4 | M-B5 | — | ASSIGNED |
| R6.5 | 100dvh covers iOS Safari address-bar; verified via R7 real-device | M-B5 | — | ASSIGNED (cross-cuts) |
| R6.6 | MediaRecorder timeslice ≥ 1000ms on iOS (avoid zero-length segments) | M-B5 | — | ASSIGNED |
| R6.7 | Orientation: graceful landscape (no portrait lock; existing CSS adapts) | M-B5 | — | ASSIGNED |
| R7.1 | Operator iPhone 14 + Android SIMULTANEOUS real-device smoke | M-B6 | — | ASSIGNED |
| R7.2 | Lighthouse mobile audit ≥ 85 acc / ≥ 70 perf / ≥ 85 best-practices | M-B6 | — | ASSIGNED |
| R7.3 | Real 2-min call between two REAL devices (iOS + Android) audio+video | M-B6 | — | ASSIGNED |
| R7.4 | Side-by-side comparison screenshots (mobile + desktop) | M-B6 | — | ASSIGNED |
| R7.5 | Final JROM smoke + sign-off | M-B6 | — | ASSIGNED |
| R8.1 | Full Run 1 desktop e2e regression at every M-B* gate | All | — | ASSIGNED (per-batch gate) |
| R8.2 | Each shared-surface M-B* paired "desktop unaffected" spec | M-B1+M-B3+M-B5 | — | ASSIGNED |
| R8.3 | Phase 2 two-axis matrix VIEWPORT-SPECIFIC assertions (NOT same-test-at-both) | Phase 2 | — | ASSIGNED |
| R8.4 | WebRTC mobile compromises (480p / cap-4) NOT applied to desktop | M-B2 | — | ASSIGNED |
| R8.5 | CSS regression screenshots per M-B* (desktop-regression/) | All | — | ASSIGNED |

**Deferred to v3.5 (out of Run 3 scope):**
- R3.2 5-bar mic-meter mobile variant (visual polish; keep 8 bars on mobile)
- R4.1 tap-to-focus-tile primary view (state-machine complexity; risks B6 grid regression)
- R4.2 swipe-between-sidebar-tabs (tap-to-switch is the placeholder; R2.7)
- R5.4 adaptive auto-downgrade via getStats() (480p static is fine for Run 3)
- R6.4 fullscreen helper with webkit fallback (dead code if not used in Run 3)

**Totals at run start (revised, 2026-05-19):** 0 VERIFIED / 30 ASSIGNED / 0 PARTIAL / 0 FAIL. (-3 from defers + 5 new from consult adds + minor renumbering.)

# implementation-plan.md — meet-poc v2 Run 1

**Locked:** 2026-05-19. Contracts: `og-requirements.md` + `scenarios.md`. Architectural truth (post-v1): `project_specs.md` (will be updated incrementally).

**Implementer:** Codex (`$lead`) in tmux `lkvcdx-39`. JROM directive: continue the coordinate-with-codex pattern from v1.
**Coordinator:** Claude `/projcore`.
**Pattern:** 2 (supervisor-across-tmux). 3-call tmux send protocol.

---

## Branches

| Batch | Branch |
|-------|--------|
| B1 | `feat/meet-v2-b1-sessions-backend` |
| B2 | `feat/meet-v2-b2-host-authority` |
| B3 | `feat/meet-v2-b3-app-shell` |
| B4 | `feat/meet-v2-b4-tabs-pagination` |
| B5 | `feat/meet-v2-b5-lobby-preview` |
| B6 | `feat/meet-v2-b6-grid-overlays-clock` |
| B7 | `feat/meet-v2-b7-controls-banner-failure` |
| B8 | `feat/meet-v2-b8-sidebar-actions-leave-speaker` |

Each branch off the prior PASSED branch (B2 off B1, B3 off B2, etc.). No merge to main between batches; the chain lands as a unit at Phase 2 acceptance.

## Dependencies

```
B1 ──→ B2 ──→ B3 ──→ B4 ──→ B5 ──→ B6 ──→ B7 ──→ B8 ──→ Phase 2
                       │
                       └── B5 establishes MediaDevices plumbing
                            reused by B6 (tile rendering), B7 (device-failure UX),
                            B8 (active-speaker analyzer).
```

B1 (sessions) is consumed by B2 (recording binding) + B4 (Ongoing/Past tabs). B2 (WS messages) is consumed by B6 (media-state for tile overlays), B7 (recording-started/stopped for banner), B8 (mute-target / remove-peer / meeting-ended).

## Batches

(Per og-requirements.md and scenarios.md — see those for full surface. Implementation-plan rows are pointers + scope hard limits per batch.)

### B1 — Backend: meeting_sessions + lifecycle + paginated API
- **Req#:** R1.1-R1.6
- **Scenarios closed:** S1.1-S1.8
- **Likely files:** `backend/migrations/0003_meeting_sessions.sql` (new), `backend/src/modules/signaling/{index,sessions}.ts` (signaling adds session lifecycle hooks; new sessions helper module), `backend/src/modules/sessions/index.ts` (new — REST router), `backend/tests/sessions-*.test.ts` (new)
- **Tests:** vitest backend; WS clients exercise session lifecycle.
- **Scope hard limits:** no audit_events table (claude-peer drop). No `getHostClientId` use elsewhere yet — added but B2 wires consumers.

### B2 — Backend: host authority + recording binding
- **Req#:** R2.1-R2.7
- **Scenarios closed:** S2.1-S2.9
- **Likely files:** `backend/src/modules/recording/index.ts` (extend — auth + session-bound), `backend/src/modules/signaling/index.ts` (extend — new WS commands + broadcasts), `backend/src/modules/auth/middleware.ts` (extend if needed for upload), `backend/tests/recording.test.ts` + `signaling-host-actions.test.ts` (new)
- **Scope hard limits:** no FE changes; no new tables beyond B1's.

### B3 — Frontend: app shell refactor
- **Req#:** R3.1-R3.4
- **Scenarios closed:** S3.1-S3.4
- **Likely files:** `frontend/src/app/app.routes.ts` (replace dashboard with /app/* tree), `frontend/src/app/pages/app-shell/` (new layout component), `frontend/src/app/pages/transcripts-stub/` (new), `frontend/src/app/pages/settings-stub/` (new), `frontend/src/app/guards/auth.guard.ts` (move to /app/**). Old `dashboard.page` survives as child route content for `/app/rooms` (kept or refactored)
- **Tests:** Playwright e2e `tests/v2-b3-shell/`
- **Scope hard limits:** no new business logic; just routing + layout shell.

### B4 — Frontend: tabs + pagination
- **Req#:** R4.1-R4.6
- **Scenarios closed:** S4.1-S4.5
- **Likely files:** `frontend/src/app/pages/rooms/`, `frontend/src/app/pages/ongoing/`, `frontend/src/app/pages/past/`, `frontend/src/app/pages/recordings/` (split from dashboard), `frontend/src/app/services/{rooms,recordings,meeting-sessions}.service.ts` (extend with pagination + new sessions endpoint client). Backend: extend `GET /api/rooms` to accept `?page=&pageSize=` (backward compat — legacy callers without params get the old shape)
- **Tests:** Playwright `tests/v2-b4-tabs/`
- **Scope hard limits:** no Transcripts or Settings tab content (stubs are B3).

### B5 — Frontend: lobby device preview (Pattern X)
- **Req#:** R5.1-R5.5
- **Scenarios closed:** S5.1-S5.5
- **Likely files:** `frontend/src/app/pages/room/room.page.ts` (lobby state extension), `frontend/src/app/services/media.service.ts` (extend — pre-acquire + enumerateDevices + level meter analyzer), `frontend/src/app/components/lobby-preview/` (new — visual component), `frontend/src/app/components/mic-meter/` (new)
- **Tests:** Playwright `tests/v2-b5-lobby/`
- **Scope hard limits:** Test mic playback (R5.4) optional — codex picks + logs.

### B6 — Frontend: in-call grid + per-tile overlays + clock
- **Req#:** R6.1-R6.5
- **Scenarios closed:** S6.1-S6.6
- **Likely files:** `frontend/src/app/pages/room/room.page.html` + `.scss` (grid + clock topbar), `frontend/src/app/components/tile/` (extend — overlays + avatar), `frontend/src/app/services/{ws,media}.service.ts` (extend — media-state broadcast)
- **Tests:** Playwright `tests/v2-b6-grid/`
- **Scope hard limits:** No participant sidebar yet (B8). No active-speaker (B8).

### B7 — Frontend: controls polish + recording banner + device failure UX
- **Req#:** R7.1-R7.5
- **Scenarios closed:** S7.1-S7.5
- **Likely files:** `frontend/src/app/components/controls-bar/` (icon-state + host-gated Record), `frontend/src/app/components/recording-banner/` (new), `frontend/src/app/pages/room/room.page.ts` (subscribe to recording-started/stopped + permission errors), `frontend/src/app/services/media.service.ts` (extend — error states)
- **Tests:** Playwright `tests/v2-b7-controls/`
- **Scope hard limits:** Sidebar + active speaker stays in B8.

### B8 — Frontend: participant sidebar + host actions + leave UX + active-speaker
- **Req#:** R8.1-R8.7
- **Scenarios closed:** S8.1-S8.9
- **Likely files:** `frontend/src/app/components/participant-sidebar/` (new — replaces `waiting-room-panel`), `frontend/src/app/components/leave-dialog/` (new), `frontend/src/app/pages/room/room.page.ts` (orchestration), `frontend/src/app/services/{ws,webrtc,recorder}.service.ts` (extend — active-speaker analyzer + flush-on-end), `frontend/src/app/components/meeting-ended-toast/` (new)
- **Tests:** Playwright `tests/v2-b8-sidebar/`
- **Scope hard limits:** active-speaker analyzer throttled to 8Hz (explicit in brief).

## Test authority

- B1, B2: vitest backend OK unattended. ws-client test harness from rebuild B2 reused.
- B3-B8: Playwright targeted per-module (§2.10a). Two-context tests in B6, B7, B8 — costly, run deliberately.
- All e2e tests MUST clean up created rooms/recordings/sessions (hygiene rule, og-requirements end).

## Dispatch model

Per /projcore §1.8 + §2.9: per-batch brief at `prompts/batch-<n>.md`. Tmux dispatch with `$lead` persona switch. Callback to `progress.md` + `callbacks.md`. Commit before STATUS: DONE (rule carried from v1 B4 closure).

## Stop conditions

Per /projcore §1.18 — same as v1. The lobby device preview (B5) is the most likely to surface NEEDS-INFO (permission flows are browser-quirky); fast-fail to JROM if Playwright fake-media flags don't work as expected.

## Naming

Run folder: `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/`.
Decision files: `decisions/2026-05-19-v2-b<n>-<slug>.md`.
Validation files: `validation/batch-<n>.md`.

---

## Future Run 3 — Mobile UI/UX (placeholder; awaiting JROM intake)

**Status:** Architecture-level decisions LOCKED by JROM on 2026-05-19 (intake completed while Run 1 v2-B2 in flight). Run 3 is GATED on Run 1 completion (acceptance). On Run 1 PASS, /projcore refines this into og-requirements + scenarios, consults codex, then dispatches.

**Discovery findings (current FE baseline):**
- Viewport meta tag is correct: `width=device-width, initial-scale=1`
- Only 3 media queries in the entire FE (room@640, dashboard@720, controls-bar@760) — minimal mobile work done
- `min-height: 100vh` is used in **4 places** (login, dashboard, room.shell, call-panel) — classic iOS Safari bug where address bar collapse/expand causes overflow/clipping. Needs `100dvh` (dynamic viewport)
- Zero touch event handlers — only `cursor:pointer` (mouse-only)
- No PWA manifest, no service worker, no install metadata
- WebRTC primitives (MediaRecorder, getDisplayMedia) have known mobile-browser quirks not yet considered

**JROM-LOCKED decisions (2026-05-19; no further questions to be asked during Run 3 per JROM directive):**
1. **Targets:** iOS Safari (16+) **AND** Android Chrome (latest stable). Cross-platform.
2. **Strategy:** Fluid responsive single SPA — same Angular routes, breakpoint-driven mobile UI via CSS media queries + signal-driven layout swaps. NO PWA install layer (Run 3); NO separate `/m/*` route tree. (PWA can be a Run 4 if useful.)
3. **Feature parity:** Full parity EXCEPT screen-share — hidden on mobile (`getDisplayMedia` reliability varies, especially iOS pre-15). Record, host actions, sidebar, participant management all work on mobile.
4. **WebRTC mobile compromises:** Default video resolution **480p** on mobile (vs 720p desktop). Mobile peer cap **4**. Adaptive auto-downgrade via `getStats()` is a v2.5 polish, NOT Run 3 scope.
5. **Mobile cap enforcement = per-client.** Backend uses User-Agent on WS `join` to detect mobile-vs-desktop joiner. Mobile joiners hard-rejected (`{type:'error', error:'mobile room full (4 max)'}`) when 4 mobile peers already admitted. Desktop joiners stay capped at 8 overall. A mixed-platform meeting can have 4 mobile + up to 4 more desktop (8 total). Document: UA-detection is imperfect; client-side fallback also enforces a soft cap warning.
6. **Mobile sidebar = bottom-sheet** that swipes up from below to reveal participant list + host actions. Tap-outside or swipe-down dismisses. Desktop right-side `<app-participant-sidebar>` (Run 1 B8) is replaced by `<app-participant-sheet>` (or conditional swap inside the same component) when `isMobile()` is true.
7. **Background-tab audio = keep audio, pause local video.** On `document.visibilityState === 'hidden'`: pause local video track + signal `media-state {mic:current, cam:false}` to peers so they see the avatar; keep audio track unchanged. On `visible` again: resume local video + signal new state.
8. **Mobile breakpoint = `<1024px`.** Includes tablets in portrait orientation. `isMobile()` signal: `window.innerWidth < 1024`. Hooks into `resize` event with debounce. Above 1024 = desktop UX (existing Run 1 layout); below = mobile UX (sheet, docked controls, mobile grid).

**Probable Run 3 batch shape (subject to og-requirements refinement at run-start):**

- **M-B1 — Mobile foundations.** Viewport-units migration (`100vh` → `100dvh` everywhere), touch-target audit (48px minimum on all interactive controls), responsive breakpoint system formalized (suggest `xs <480`, `sm 480-767`, `md 768-1023`, `lg 1024+`), `isMobile()` signal driving conditional rendering. NO PWA manifest in this batch (locked: not in Run 3).
- **M-B2 — Mobile call layout.** Bottom-sheet pattern replaces the right-side participant sidebar (B8 in Run 1) when on mobile. Controls bar → docked bottom (thumb-reachable). Dynamic-grid mobile variants: 1 peer = full-screen with safe-area insets, 2-3 = vertical stack, 4 = 2x2 (the mobile cap). Screen-share button **hidden** on `isMobile()`. Mute icon overlays remain.
- **M-B3 — Mobile lobby.** Camera-switch button (front ↔ rear) using `getUserMedia({video:{facingMode:'user'|'environment'}})`. Compact mic-level meter. Single-column device selectors (vs side-by-side desktop).
- **M-B4 — Touch interactions.** Tap-to-focus-tile (taps non-self tile → that tile becomes primary, others go to thumbnail strip). Swipe between sidebar tabs in bottom-sheet. Pinch-to-zoom and double-tap-to-pin DEFERRED to v2.5.
- **M-B5 — Mobile WebRTC adjustments.** `MediaService.getUserMedia()` requests `{video: {width: 854, height: 480}}` on mobile (vs default desktop). Backend signaling soft-rejects 5th admit when room has mobile peers (or just enforce mobile-room-cap=4 client-side via UI). Background-tab handling: pause local video on `document.hidden` (keep audio); resume on visible.
- **M-B6 — iOS Safari specifics.** UA-detection helper for iOS. `getDisplayMedia` already hidden via `isMobile()` (M-B2); also hard-fail with a friendly message if a user somehow lands on the desktop URL on mobile (rare). MediaRecorder mime fallback (`audio/mp4` if `audio/webm` unsupported on iOS — research at batch time). Fullscreen API differences (`webkitRequestFullscreen` fallback).
- **M-B7 — Acceptance.** Operator-assisted real-device test pass: iPhone 14+ Safari + Pixel/Android Chrome. Lighthouse mobile audit (accessibility, performance, best-practices targets ≥85). Real call on real phones for 2 minutes. JROM smoke + sign-off.

**Cross-batch quality gates:**
- `100vh` must be eliminated entirely (or fall-back via `100dvh` + `100vh` for older browsers).
- All interactive elements pass 48×48 px hit-test.
- Mobile call sustains ≥ 25 FPS for self-tile and remote tiles for 2 minutes on a current mid-range Android (Pixel 7 or equivalent).
- Mobile call sustains for 2 minutes without dropping below 30% battery from 80% on iPhone 14 (or note as future-tune if degrades).

**Regression discipline (JROM directive 2026-05-19) — MANDATORY for every M-B*:**

Mobile is risky because it touches shared CSS, shared services, shared components, and shared route handlers. Each M-B* batch MUST satisfy ALL of:

1. **Full Run 1 desktop e2e regression at every batch gate.** Codex MUST run the entire desktop suite (v2-b3-shell + v2-b4-tabs + v2-b5-lobby + v2-b6-grid + v2-b7-controls + v2-b8-sidebar) against the live PM2 stack BEFORE posting `STATUS: DONE`. **Any single desktop spec failure = batch FAIL** — no soft pass. If the failure traces to the mobile change, fix or roll back. If it traces to a pre-existing flake, codex must surface it as a blocker and /projcore decides.
2. **Desktop-only scenarios** added per M-B*: every mobile batch that touches shared surface gets a paired "desktop unaffected" spec. Examples:
   - M-B1 (100vh → 100dvh) → `tests/v3-b1-foundations-desktop-regression.spec.ts` asserting topbar + tiles-grid + lobby render at full 1920×1080 viewport with identical visual layout (Playwright snapshot or DOM measurement).
   - M-B2 (bottom-sheet vs sidebar) → `tests/v3-b2-layout-desktop.spec.ts` confirming `<app-participant-sidebar>` is STILL the right-side panel (not a bottom sheet) at viewport ≥ 768.
   - M-B6 (iOS Safari specifics) → `tests/v3-b6-non-mobile-platform.spec.ts` confirming `getDisplayMedia` button is STILL visible at desktop UA + viewport (not gated by stale UA detection).
3. **`isMobile()` signal must short-circuit cleanly** — desktop path defaults to the existing Run 1 behavior unless the viewport explicitly meets the mobile breakpoint. Default-to-desktop, not default-to-mobile-detection-with-quirks.
4. **Two-axis test matrix** at M-B7 final acceptance: every B3/B4/B5/B6/B7/B8 scenario re-run at TWO viewports — 1920×1080 (desktop) and 390×844 (iPhone 14 portrait) — both must be GREEN for sign-off. /projcore enforces this in Phase 2.
5. **WebRTC compromises (480p mobile, peer-cap-4) MUST NOT apply to desktop.** Verified by a desktop scenario asserting `getUserMedia({video:{width:1280, height:720}})` (or whatever the desktop default is) at desktop viewport.
6. **CSS regression**: codex adds a `screenshots/desktop-regression/` folder per M-B* with comparison shots of each major page at 1920×1080. /projcore checks visually + via Playwright DOM-bounding-rect assertions. Any visible-pixel drift from Run 1 closing screenshots is a flag.

**Codex must declare in every M-B*'s `changes.md`:**
- Full list of desktop e2e suites run + pass counts
- Any shared service / component / SCSS file touched + the regression spec covering it
- Explicit "no desktop scenarios FAILED" confirmation

**/projcore enforcement:**
- Gate 4 of the per-batch validation includes "desktop full e2e regression" as a hard check.
- Phase 2 final acceptance runs the two-axis matrix (desktop + mobile viewport) against voice.silverjrom.app, both must pass.
- If any desktop scenario regresses mid-Run-3, /projcore raises immediately to JROM — no autonomous decision to ship a desktop-broken state.

**Dependencies:**
- Run 3 starts ONLY after Run 1 acceptance (because mobile builds on the participant-sidebar / controls / grid from Run 1 — can't mobilize what doesn't exist yet).
- Run 2 (transcripts) is independent of Run 3 and can ship in either order.




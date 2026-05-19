# implementation-plan.md — meet-poc v3 mobile UI/UX

**Locked:** 2026-05-19. Predecessor: v2 Run 1 ACCEPTED 44/44. Contracts: `og-requirements.md` + `scenarios.md`. Architectural truth (carries from v2): `project_specs.md`.

**Implementer:** Codex (`$lead`) in tmux `lkvcdx-39`. JROM directive (carried): no questions to JROM during Run 3 — all decisions locked.
**Coordinator:** Claude `/projcore`.
**Pattern:** 2 (supervisor-across-tmux). Dual-source watcher (pane + callbacks) at every dispatch per the watcher-fix landed during v2.

---

## Branches

| Batch | Branch |
|-------|--------|
| M-B1 | `feat/meet-v3-mb1-foundations` |
| M-B2 | `feat/meet-v3-mb2-call-layout` |
| M-B3 | `feat/meet-v3-mb3-lobby` |
| M-B4 | `feat/meet-v3-mb4-touch-interactions` |
| M-B5 | `feat/meet-v3-mb5-webrtc-adjustments` |
| M-B6 | `feat/meet-v3-mb6-ios-specifics` |
| M-B7 | `feat/meet-v3-mb7-acceptance` (mostly operator-assisted; only the Lighthouse/screenshot evidence committed here) |

Each branch off the prior PASSED branch.

## Dependencies

```
M-B1 ──→ M-B2 ──→ M-B4 ──→ M-B7
   │       │        │
   └→ M-B3 │        │
   └→ M-B5 │
   └→ M-B6 ┘
```

M-B1 (foundations) is the prerequisite for everything else — `isMobile()` signal + breakpoint partial + 100dvh migration are consumed by every later batch. M-B2 (call layout) is consumed by M-B4 (touch interactions in the new bottom-sheet). M-B5 (WebRTC adjustments) is independent of layout work — could parallelize but we keep it serial for clean per-batch validation.

## Batches

### M-B1 — Mobile foundations
- **Reqs:** R1.1-R1.5 + R8.1-R8.2 (regression baseline)
- **Scenarios:** S1.1-S1.5
- **Likely files:** `frontend/src/app/services/viewport.service.ts` (new), `frontend/src/styles/_breakpoints.scss` (new), every `*.scss` with `100vh` (audit + update), `frontend/src/app/components/**/*.scss` for 48px touch-target fixes, `e2e/tests/v3-mb1-foundations/*.spec.ts` (mobile + desktop regression specs)
- **Scope:** mandatory baseline. Desktop e2e must remain 40/40 green at gate.

### M-B2 — Mobile call layout
- **Reqs:** R2.1-R2.5
- **Scenarios:** S2.1-S2.8
- **Likely files:** new `<app-bottom-sheet>` component (or extend `<app-participant-sidebar>` with `isMobile()`-driven mode swap), `frontend/src/app/components/controls-bar/*.scss` (mobile docking + safe-area-inset), `frontend/src/app/pages/room/room.page.{scss,ts}` (mobile grid variants), `e2e/tests/v3-mb2-call-layout/*`
- **Scope:** highest-visibility batch. Two-axis viewport assertions everywhere.

### M-B3 — Mobile lobby
- **Reqs:** R3.1-R3.3
- **Scenarios:** S3.1-S3.5
- **Likely files:** `frontend/src/app/components/lobby-preview/*` (Flip camera button + mobile layout), `frontend/src/app/services/media.service.ts` (extend with `setFacingMode()` if not already), `frontend/src/app/components/mic-meter/*.html` (5-bar mobile variant), `e2e/tests/v3-mb3-lobby/*`

### M-B4 — Touch interactions
- **Reqs:** R4.1-R4.2
- **Scenarios:** S4.1-S4.5
- **Likely files:** `frontend/src/app/pages/room/*` (tap-to-focus state machine), bottom-sheet swipe handler from M-B2 (extended for tab-swipe), `e2e/tests/v3-mb4-touch/*` (uses Playwright touch API)
- **Scope:** Pinch / double-tap-to-pin DEFERRED to v3.5 (R4.3).

### M-B5 — Mobile WebRTC adjustments
- **Reqs:** R5.1-R5.4
- **Scenarios:** S5.1-S5.5
- **Likely files:** `frontend/src/app/services/media.service.ts` (mobile vs desktop constraints), `backend/src/modules/signaling/index.ts` (per-client UA cap on join), `frontend/src/app/pages/room/*` (visibilitychange listener), `e2e/tests/v3-mb5-webrtc/*`, `backend/tests/signaling-mobile-cap.test.ts`
- **Scope:** ONLY mobile changes — desktop video resolution + 8-peer cap unchanged.

### M-B6 — iOS Safari specifics
- **Reqs:** R6.1-R6.5
- **Scenarios:** S6.1-S6.4
- **Likely files:** `frontend/src/app/services/platform.service.ts` (new), `frontend/src/app/services/recorder.service.ts` (mime fallback), `frontend/src/app/lib/fullscreen.ts` (new helper)
- **Scope:** UA-based + capability-based detection. No new components.

### M-B7 — Real-device acceptance
- **Reqs:** R7.1-R7.5 (R8.3 two-axis matrix is Phase 2's job)
- **Scenarios:** S7.1-S7.5 (operator-assisted)
- **Likely files:** `plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-7/screenshots/` (operator captures); commit only the evidence, no code changes expected
- **Scope:** acceptance batch. Codex's role is mostly to collect screenshots + Lighthouse JSON + write changes.md summary. Operator owns the real-device probing.

## Test authority

- Backend vitest (M-B5 mobile-cap test) — unattended OK
- Playwright per-module mobile + desktop — `--workers=1` for cross-batch sweeps (carried from v2 learning)
- Phase 2 two-axis viewport matrix (1920×1080 + 390×844) for every B3-B8 + M-B1-M-B6 scenario

## Dispatch model

Per v2 pattern + the **dual-source watcher** (`tmp/projcore-confirm-watcher.sh`):
- Brief at `prompts/batch-<n>.md`
- 3-call tmux send with `$lead` persona switch
- Watcher runs both pane-scan (for confirmation prompts) AND callbacks-file (for STATUS lines)
- Callback to `progress.md` + `callbacks.md`
- **Commit BEFORE STATUS: DONE** — this rule was broken twice in v2 (B6 + B8 false-alarm). For Run 3, dispatch briefs put this as the FIRST line after persona-switch.

## Stop conditions (per /projcore §1.18)

- Contradictory spec → pause + ask
- 3× FAIL on same batch → escalate with 3 options
- Real-device acceptance (M-B7) FAIL → surface to JROM with screenshots; codex doesn't auto-retry hardware issues
- Lighthouse below targets → flag in batch report, NOT auto-blocker (per Q6 default)

## Run 3 expected outcome

7 batches, ~30 scenarios, all Run 1 desktop reqs remain VERIFIED. Phase 2 = two-axis viewport matrix. JROM smoke + sign-off on real devices.

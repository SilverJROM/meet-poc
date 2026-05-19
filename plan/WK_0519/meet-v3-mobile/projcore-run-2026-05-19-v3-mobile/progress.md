# progress.md — meet-poc v3 mobile Run 3

Live state of the run. Codex appends callbacks in `## Callbacks log`.

## Run state

- **Started:** 2026-05-19 (third run today)
- **Coordinator:** Claude `/projcore`
- **Implementer:** Codex (`$lead`) in `lkvcdx-39`
- **Pattern:** 2 (supervisor-across-tmux)
- **Predecessor:** v2 Run 1 ACCEPTED 44/44

## Phase 0 — contracts

- 2026-05-19 — /projcore wrote `og-requirements.md` (33 reqs across R1-R8)
- 2026-05-19 — /projcore wrote `scenarios.md` (~32 scenarios)
- 2026-05-19 — /projcore wrote `implementation-plan.md`
- 2026-05-19 — /projcore initialized `queue.md` + `req-matrix.md` + this file + `context-handoff.md`
- 2026-05-19 — /projcore consulted Codex (review-only) + Claude-peer (review-only) per JROM directive (no JROM questions during Run 3)

## Batch states

| Batch | State | Iter | Dispatched | Callback | Validated | Verdict |
|-------|-------|------|------------|----------|-----------|---------|
| M-B1 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| M-B2 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| M-B3 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| M-B4 | DONE | 1 | 2026-05-19 | 2026-05-19 | — | CALLBACK |
| M-B5 | PENDING | — | — | — | — | — |
| M-B6 | PENDING | — | — | — | — | — |

## Callbacks log

(codex appends here)

[projcore callback] v3-mb1 DONE — foundations + platform.service + viewport-fit
[projcore verdict] v3-mb1 PASS — R1.1-R1.8 VERIFIED. 100dvh migration (8 sites/4 files paired) + viewport-fit=cover + breakpoint partial via angular.json includePaths + isMobile() signal w/ 250ms debounce + platform.service.ts (moved from M-B6 per Codex). Run 1 desktop regression 40/40 in 1.0m (R8.1 gate green first try). M-B1 e2e 4/4. Backend 17/43 unchanged. Codex committed BEFORE callback (hard-reminder rule held). 1 decision logged (scss-includepaths). Matrix: 10/30 VERIFIED. See validation/batch-1.md.
[projcore callback] v3-mb2 DONE — WebRTC mobile adjustments + 480p + client-declared mobile cap + bg-tab pause
[projcore verdict] v3-mb2 PASS — R5.1+R5.2+R5.3+R5.5+R5.6+R8.4 VERIFIED. Mobile 480p preflight; client-declared mobile:true PRIMARY (UA audit-only); cap=4 in join MSG handler; PeerEntry.isMobile; bg-tab pauses local video keeps audio. Cap stacking proven (4 mobile + 4 desktop = 8). Backend 18/45 (+2). M-B2 e2e 5/5. **Run 1 desktop regression 40/40 GREEN (R8.1 held 2nd time)**. 1 decision logged (webrtc-mobile-trust). Matrix: 17/30 VERIFIED. See validation/batch-2.md.
[projcore callback] v3-mb3 DONE — mobile call layout + bottom-sheet + docked controls + grid
[projcore verdict] v3-mb3 PASS — R2.1-R2.7 + R8.1+R8.2+R8.5 VERIFIED. Bottom-sheet (75dvh + backdrop + drag-handle + swipe-down + auto-close on input focus for iOS keyboard) extends sidebar; docked controls w/ safe-area; mobile grid 1/2/2x2; screen-share hidden mobile; tap-tabs replace deferred swipe-tabs. 9 specs PASS. **Run 1 regression 40/40 GREEN (R8.1 held 3rd consecutive batch)**. Backend 45/45 unchanged. 1 decision logged. Commit-before-DONE held. Matrix: 24/30 VERIFIED. See validation/batch-3.md.
[projcore callback] v3-mb4 DONE — mobile lobby + AudioContext gesture gate + camera switch

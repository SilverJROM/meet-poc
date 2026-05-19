# queue.md — meet-poc v3 mobile Run 3 (REVISED post-consult)

**Run start:** 2026-05-19
**Pattern:** 2 (supervisor-across-tmux) with **dual-source watcher** (pane + callbacks)
**Implementer:** Codex (`$lead`) in `lkvcdx-39`
**Coordinator:** Claude `/projcore`
**Plan:** `../implementation-plan.md`
**Contract:** `../og-requirements.md` + `decisions/2026-05-19-v3-pre-dispatch-revisions.md` (revisions supersede original rows)
**Scenarios:** `../scenarios.md`

**Batch shape revised post Codex + Claude-peer consults (both REVISE):** 7 → 6 batches. Touch-interactions batch dropped (tap-to-focus + swipe-tabs deferred to v3.5; tap-to-switch absorbed into call-layout batch). M-B2 = WebRTC (moved early for debug runway). platform.service.ts moved into M-B1 foundations.

| Batch | Title | Status | Branch |
|-------|-------|--------|--------|
| M-B1 | Mobile foundations (incl. platform.service + viewport-fit + Angular SCSS partial setup) | PENDING | feat/meet-v3-mb1-foundations |
| M-B2 | WebRTC mobile adjustments (480p + client-declared mobile:true + cap-4 + bg-tab) | PENDING | feat/meet-v3-mb2-webrtc |
| M-B3 | Mobile call layout (bottom-sheet + docked controls + grid + screen-share hidden + iOS keyboard + tap-to-switch tabs) | PENDING | feat/meet-v3-mb3-call-layout |
| M-B4 | Mobile lobby (camera switch + single-column selectors + AudioContext gesture-gated meter) | PENDING | feat/meet-v3-mb4-lobby |
| M-B5 | iOS Safari specifics (MediaRecorder capability list + timeslice ≥1000ms + orientation graceful landscape) | PENDING | feat/meet-v3-mb5-ios |
| M-B6 | Real-device acceptance (operator iPhone + Android SIMULTANEOUS + Lighthouse + JROM smoke) | PENDING | feat/meet-v3-mb6-acceptance |

**Deferred to v3.5:** R4.1 tap-to-focus-tile, R4.2 swipe-between-tabs, R3.2 5-bar mic-meter, R6.4 fullscreen helper, R5.4 adaptive getStats() downgrade.

Final acceptance: every Run 3 req VERIFIED + Phase 2 viewport-specific two-axis matrix PASS against voice.silverjrom.app + real-device JROM smoke.

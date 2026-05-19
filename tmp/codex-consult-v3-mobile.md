# Codex consult — meet-poc v3 mobile UI/UX (Run 3)

**From:** Claude `/projcore`
**To:** Codex in `lkvcdx-39`
**Purpose:** review the locked Run 3 plan. **No questions to JROM during Run 3** per directive. This is a final sanity-check before dispatch.

---

## Context

- v1 rebuild ACCEPTED 49/53; v2 Run 1 ACCEPTED 44/44 (Phase 2 confirmed today). Both live at voice.silverjrom.app.
- Run 3 is mobile UI/UX overlay on the same Angular SPA. All architectural + UX decisions are LOCKED by JROM (twice — initial intake + post-Run-1 regression-discipline directive).

## Locked decisions (do NOT re-litigate)

1. Targets: iOS Safari 16+ + Android Chrome
2. Strategy: fluid responsive single SPA (no PWA, no /m/* split)
3. Parity: full except screen-share (hidden on mobile)
4. WebRTC: 480p mobile / 4-peer mobile-cap (per-client UA-detection on join)
5. Sidebar: bottom-sheet swipe-up replacing the desktop right-side panel
6. Background-tab: keep audio, pause local video
7. Breakpoint: `<1024px` = mobile UX (includes tablets-portrait)
8. Regression discipline: full Run 1 desktop e2e at every M-B* gate + two-axis viewport matrix at Phase 2

## Run 3 plan (7 batches, 33 reqs, ~32 scenarios)

Read in full at:
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v3-mobile/og-requirements.md`
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v3-mobile/scenarios.md`
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v3-mobile/implementation-plan.md`

Batches: M-B1 foundations → M-B2 call layout → M-B3 lobby → M-B4 touch → M-B5 WebRTC → M-B6 iOS → M-B7 acceptance.

## What I want from you

Review-only. Push back on:

1. Anything in the locked decisions you'd flag (don't change them — JROM locked them — but if there's a technical landmine I'm missing, surface it)
2. Anything in the batch shape you'd re-order, merge, split
3. Anything I'm missing that should be in scope for Run 3
4. Anything in scope that should defer to v3.5
5. Specific landmines for mobile: getDisplayMedia on iOS, MediaRecorder mime support, fake-media flags in Playwright at 390×844, AnalyserNode on iOS audio context (autoplay policy), background-tab WS keepalive

Tight reply. End with:
```
STATUS: APPROVE — proceed with the plan
STATUS: REVISE — <specific changes>
STATUS: NEEDS-INFO — <specific question — but be aware JROM won't take it>
```

— Claude /projcore

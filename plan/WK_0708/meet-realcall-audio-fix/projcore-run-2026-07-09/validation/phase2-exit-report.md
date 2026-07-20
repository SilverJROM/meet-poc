# Phase 2 Exit Report — meet-realcall-audio-fix

**Date:** 2026-07-09T15:28:15+00:00  
**Verdict:** Phase 2 **CONFIDENCE PASS** — ready for **Phase 3 gate** (do not auto-start)

## What landed

1. **B00S-BUDGET** — acceptance-only burn + CAP25 (callBurnCount operational 0/25)
2. **AC1 defect** — 2-party auto-gain no-op proven (P2-LOCAL-02)
3. **AC1 fix** — `AUTO_LEVEL_ABS_TARGET=0.5`, `reference=max(loudest,ABS_TARGET)` in `0519d09`
4. **Stimulus** — gum-shim r-grid ±20% on Chromium fake-device (73e398a)
5. **Harness** — INVALID≠PASS matrix, CAP regression, maxForks=3

## Phase 3 gate request

Approve start of **Phase 3: 25 live SFU tests** (post this confidence).  
Prereq for live: **`ng build`** frontend so ABS_TARGET ships in served bundle.

## Explicitly not done

- Live dual-browser A≥0.70 acceptance on SFU
- AC3 AudioParam ramp
- real-virtual-mic / .123
- dev_machine shutdown (must not)

MEM at exit: total=61Gi used=28Gi free=15Gi avail=32Gi

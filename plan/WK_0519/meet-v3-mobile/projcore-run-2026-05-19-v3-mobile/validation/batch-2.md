# Validation — v3-M-B2 (Mobile WebRTC adjustments)

**Verdict:** **PASS** (iter 1, clean, commit-before-DONE held).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 1 decision (`webrtc-mobile-trust` — UA is audit-only, client `mobile:true` is truth). 3 real screenshots.

## Gate 2 — Diff review

4 atomic commits + projcore-housekeeping commit:
```
d86a5a7 docs: add M-B2 evidence artifacts
db11fb1 test: add M-B2 WebRTC mobile coverage
8f85d2a feat: add mobile WebRTC constraints and lifecycle handling
917e757 docs: record M-B1 validation and M-B2 dispatch context  (codex housekept)
```

Surfaces touched:
- `frontend/src/app/services/media.service.ts` — branches on `viewport.isMobile()` for preflight + reacquire + camera-toggle. Exposes `__meetDebug.lastVideoConstraints` (debug-only).
- `frontend/src/app/services/ws.service.ts` — `join` payload now includes optional `mobile: boolean`
- `frontend/src/app/pages/room/room.page.ts` — sends `mobile: this.viewport.isMobile()` on join; mobile-only `visibilitychange` listener that pauses local video on hidden + broadcasts `media-state {cam:false}`; restores on visible
- `backend/src/modules/signaling/index.ts` — `PeerEntry` gained `isMobile` field; `join` handler reads `Boolean(msg.mobile)` as truth, UA-derived guess logged as audit telemetry on mismatch; mobile cap (=4) check fires BEFORE global cap (=8) check
- `backend/tests/signaling-mobile-cap.test.ts` — backend coverage for the cap stacking
- `e2e/tests/v3-mb2-webrtc/*` — 5 specs: mobile-constraints, desktop-constraints (regression), mobile-cap-rejection, background-tab, background-tab-desktop (regression)

**Key codex decision (logged):** UA is audit-only, `mobile: true` from client is truth for cap. Matches Claude-peer's catch from the consult — iPad-shipping-desktop-UA case is now correctly handled.

## Gate 3 — Build

`npm run build` PASS. Backend + frontend tsc clean.

## Gate 4 — Targeted + regression tests

- **Backend: 18 files / 45 tests** (was 17/43, +1 file +2 tests for `signaling-mobile-cap`)
- **M-B2 e2e: 5/5** in 7.1s
- **Run 1 desktop regression: 40/40 PASS** in 1.1m (R8.1 gate held)

The R8.1 gate is now twice-proven (M-B1 + M-B2 both held the 40/40 desktop suite). Strong signal that mobile changes are non-leaky.

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ Real DOM + real ws clients + real Express via backend
- Q2 ✓ Constraint object inspected via `__meetDebug` debug hook (correct — `MediaStreamConstraints` not observable from DOM)
- Q3 ✓ 3 screenshots: 480p constraint debug, 720p constraint debug, mobile-room-full error
- Q4 ✓ 5 scenarios = 5 spec files (1:1)
- Q5 ✓ Live URL serves; backend cap enforcement verified via real ws clients

### Live evidence (independent)

```
backend: 45/45 tests in 10.4s
M-B2 e2e: 5/5 in 7.1s
Run 1 regression: 40/40 in 1.1m
```

**Codex's `webrtc-mobile-trust` decision:** the most important architectural commitment of Run 3 — the cap enforcement uses client-declared `mobile:true` as authoritative, UA only audited for telemetry. Aligns with Claude-peer's biggest landmine catch from the consult (iPad ships desktop UA + UA-spoof). The cap-stacking table in changes.md covers all the edge cases including the 4-mobile + 4-desktop = 8-cap final-row case.

### Hygiene

Codex's M-B2 tests cleaned up cleanly. My regression rerun added 15 rooms + 16 sessions → cleaned post-validation.

## Gate 6 — Matrix update

R5.1, R5.2, R5.3, R5.5, R5.6 → **VERIFIED**. R8.4 (mobile compromises NOT applied to desktop) → **VERIFIED** via desktop-constraints + background-tab-desktop specs. R8.1 (Run 1 regression) for M-B2 → **VERIFIED**.

## Gate 7 — Decisions

1 decision file (`webrtc-mobile-trust`). Documents the cap-enforcement trust model + UA audit-only stance. Aligns with consult landmines.

## Verdict

**PASS** — 7 reqs newly VERIFIED. **Matrix: 17/30 VERIFIED.** Highest-risk batch closed cleanly; mobile/desktop split is non-leaky in both UI and WebRTC layers. Cleared for M-B3 (mobile call layout).

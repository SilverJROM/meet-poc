# Validation — v2-B7 (Frontend controls polish + recording banner + device failure UX)

**Verdict:** **PASS** (iter 1 — commit-process gap from B6 closed; codex committed BEFORE STATUS: DONE this time).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. **4 decisions** logged (`icon-controls`, `recording-stop-order`, `device-copy`, `mid-call-device-loss`). **7 real screenshots** including `live-host-controls-record-visible.png` from voice.silverjrom.app.

## Gate 2 — Diff review

**Commit-process rule honored**: 4 atomic commits, clean tree at callback time. The "HARD REMINDER" in the B7 brief worked.

```
04658ca docs: add v2 B7 evidence artifacts
aa7e58f test: add v2 B7 controls coverage
53a2eef feat: add B7 controls banner and device UX
b1592a0 docs: add v2 batch 7 dispatch context
```

Key surfaces touched:
- `frontend/src/app/components/controls-bar/*` — icon-only buttons, single-button-per-control, `aria-pressed`, action `aria-label`, 46px touch targets (Run 3 mobile prep), Record button conditional via `@if (isHost())` so it's NOT in DOM for non-hosts.
- `frontend/src/app/components/recording-banner/*` — new standalone component with red pulse dot + "Host is recording" + duration counter (m:ss/h:mm:ss like meeting clock).
- `frontend/src/app/pages/room/*` — `recording-state` WS send on host's local recorder start/stop; subscribes to `recording-started/stopped` broadcasts and toggles banner; polished lobby-error switch on typed `MediaError` (denied/no-devices/video-denied-audio-ok/unknown); mid-call mic `onmute`/`onended` listener for non-blocking disconnected notice.
- `frontend/src/app/services/ws.service.ts` — extended types for recording-state out + recording-started/stopped in.

Codex's `recording-stop-order` decision: host stops local MediaRecorder FIRST, THEN sends `recording-state:stopped` (banner disappears via server broadcast), THEN uploads the blob. Order matters because the banner removal shouldn't wait for the upload (which can take several seconds for large blobs). ✓
Codex's `mid-call-device-loss` decision: `MediaStreamTrack.onmute` + `onended` drives the non-blocking notice. ✓

## Gate 3 — Build

`npm run build -w frontend` PASS. Both backend tsc + Angular build green.

## Gate 4 — Targeted tests

- Backend regression: **17 files / 43 tests** green (unchanged — B7 was FE-only)
- Full B3+B4+B5+B6+B7 Playwright with `--workers=1`: **32/32 in 38.1s** ✓
- All 6 B7 specs PASS individually:
  - S7.1/S7.2 record-button-host-only — host sees button; guest `toHaveCount(0)`
  - S7.3 recording-banner — both contexts see banner with advancing duration (3.0s)
  - S7.4 permission-denied polished + Retry — re-runs preflight verified
  - S7.4 no-devices polished + no Retry button
  - S7.5 controls-aria-pressed — Mute button flips aria-pressed
  - S7.5 self-camera-off-avatar — local tile shows initials when local camera OFF

**Parallel-race that broke B4 ongoing-tab earlier** is no longer a problem when using `--workers=1`. Fold this into B8 brief as the standard cross-batch sweep config.

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ Real DOM + real WS + real two-context for S7.1-S7.3 + real lobby for S7.4
- Q2 ✓ UI-level + interaction-level proof at right level
- Q3 ✓ 7 screenshots match claims (host vs non-host controls bar; banner visible; polished error states; self-camera-off avatar)
- Q4 ✓ All 6 B7 scenarios = 1 spec file w/ 6 tests (codex used a single `controls-banner-failure.spec.ts`). Acceptable.
- Q5 ✓ Live verification: live URL serves the new app; `live-host-controls-record-visible.png` captured from voice.silverjrom.app

### Live state post-validation

```
rooms = 1 (TEST_ROOM01)
sessions = 0
```

(My own rerun left 8 rooms / 9 sessions which I cleaned via SQL post-validation. Code-side hygiene fine; my /projcore reruns just need to clean up after themselves which I'm doing.)

## Gate 6 — Matrix update

R7.1, R7.2, R7.3, R7.4, R7.5 → **VERIFIED**. (Codex pre-marked these in the matrix; my independent gate-check confirms — verdict matches.)

## Gate 7 — Decisions

4 decision files all properly placed. Codex's `device-copy` decision documents the exact user-facing strings for all 5 device-failure cases — good audit trail for Run 3 mobile when these strings get reused.

**Process win:** codex committed BEFORE STATUS: DONE this time. The "hard reminder" injection worked.

## Verdict

**PASS** — 5 new VERIFIED. **Matrix: 38/44 VERIFIED, 6 ASSIGNED, 0 PARTIAL, 0 FAIL.** Only B8 remains in Run 1. Cleared for B8 (participant sidebar + host actions + leave UX + active-speaker).

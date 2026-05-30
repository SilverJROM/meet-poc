# Test Report — Batch B5: Device self-test fidelity, no false pass (R8)

**Tested Against**: working tree @ `feat/meet-diagnostics-audio-20260529` @ `2c062ff` (HEAD verified). Unit specs via `npx tsx`; builds via `npm run build`; structural via `grep`/`git diff`; optional render-smoke via Playwright 1.60.0 (system chromium) against the live PM2 app on `http://localhost:4700`.
**Branch**: `feat/meet-diagnostics-audio-20260529`
**Author**: [qa] — Mode 2 (Testing)
**Date**: 2026-05-30
**Scenarios**: `validation/B5/scenarios.md` (U-1..U-11, M-1..M-3)

---

## NS5 limitation (stated, not fabricated)

WebRTC real-mic capture cannot be exercised headless: Chrome's `--use-fake-device-for-media-stream` emits a continuous **tone** on every fake input, so the cumulative-energy accumulator always sees rising energy and `classifyMicCapture` always returns `'working'`. A fake-media "silent mic shows the flag" Playwright test is **impossible** and was **NOT** written or claimed. The "false pass is now caught" behavior is proven by the **deterministic unit cases** (hand-built FLAT-energy windows fed to the SAME in-call `classifyMicCapture` + `nextMicWarningState`) + **structural checks** + **builds**, with **M-1..M-3 MANUAL-PENDING** on the JROM/USER seat (localhost:4700).

---

## Unit tests (primary deterministic proof) — `npx tsx`

| # | Scenario | Action | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|
| 1 | U-1, U-2, U-3, U-4, U-5, U-6, U-8 | `npx tsx src/app/services/mic-selftest.spec.ts` | "mic-selftest: all assertions passed" | `mic-selftest: all assertions passed` (exit 0) | `screenshots/unit-mic-selftest-b5.txt` | PASS |
| 2 | U-11 (no-regression) | `npx tsx src/app/services/mic-energy.spec.ts` | "all assertions passed" | `mic-energy: all assertions passed` (exit 0) | `screenshots/unit-mic-energy-b5.txt` | PASS |
| 3 | U-11 (no-regression) | `npx tsx src/app/services/mic-capture-health.spec.ts` | "all assertions passed" | `mic-capture-health: all assertions passed` (exit 0) | `screenshots/unit-mic-capture-health-b5.txt` | PASS |
| 4 | U-11 (no-regression) | `npx tsx src/app/services/mic-sweep.spec.ts` | "all assertions passed" | `mic-sweep: all assertions passed` (exit 0) | `screenshots/unit-mic-sweep-b5.txt` | PASS |

The B5 spec `mic-selftest.spec.ts` carries scenario-ID-prefixed labelled blocks: `U-1` (silent ⇒ flat cumulative, delta < epsilon, level 0), `U-2` (quiet-but-working `frameMeanSquare=4e-6` ⇒ strictly increasing, raw RMS ≈ 2e-3 < 0.01), `U-3` (flat + sub-0.01 window ⇒ `'silent'` ⇒ flag; one above-0.01 level ⇒ `'working'` — threshold boundary == in-call), `U-4` (rising sub-0.01 ⇒ `'working'` ⇒ no flag + clear-on-fix), `U-5` (`micActive=false` ⇒ no flag), `U-6` (<2 usable samples ⇒ `'indeterminate'` ⇒ hold), `U-8` (constraint parity deep-equal, never `{exact:''}`). Verified by `grep -n "U-[0-9]"` (recorded in `structural-b5.txt`). All assertions executed inside that single "all assertions passed" run.

---

## Builds (gating)

| # | Target | Action | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|
| 5 | Frontend | `cd frontend && npm run build` | succeeds; pre-existing warnings OK; NO TS errors | `Application bundle generation complete.` exit 0; only 3 PRE-EXISTING warnings (NG8113 DatePipe unused in RoomsPage; Stencil empty-glob; `@mediapipe/selfie_segmentation` non-ESM) — none from B5 | `screenshots/build-frontend-b5.txt` | PASS |
| 6 | Backend | `cd backend && npm run build` | succeeds | `tsc -p tsconfig.json` clean, exit 0, no output/errors | `screenshots/build-backend-b5.txt` | PASS |

---

## Structural checks (deterministic)

| # | Scenario | Action | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|
| 7 | U-10 | `grep -rl "No sound detected" lobby-preview/ device-dialog/` | ≥1 hit in EACH dir | hit in BOTH `lobby-preview.component.html` AND `device-dialog.component.html` | `structural-b5.txt` S1 | PASS |
| 8 | U-10 (Copy Lock) | read rendered string in both templates | `No sound detected from <device> — pick another` | both render `No sound detected from {{ micTestDeviceLabel() }} — pick another` (lobby-preview:50, device-dialog:55); names the device; em-dash; substring `No sound detected` present in both | `structural-b5.txt` S1 | PASS |
| 9 | U-10 | `grep "micTestFlagged\|mode() === 'lobby'" device-dialog.component.html` | flag gated to lobby mode | `54: @if (micTestFlagged() && mode() === 'lobby')` | `structural-b5.txt` S2 | PASS |
| 10 | U-10 (no new meter) | `git diff 4a50da2 2c062ff -- media.service.ts \| grep '^+' \| grep -E 'new AudioContext\|createAnalyser' \| wc -l` | 0 | `0` (single existing analyser reused) | `structural-b5.txt` S3 | PASS |
| 11 | U-10 | `grep "lobbySelfTestFlag" room.page.html` | bound to app-lobby-preview (420) + lobby dialog (533), NOT in-call dialog (157) | `420:` (app-lobby-preview) + `533:` (lobby `app-device-dialog` mode="lobby" @517); in-call `app-device-dialog` @157 (mode="in-call") receives NO `micTestFlagged` | `structural-b5.txt` S4 | PASS |
| 12 | U-9 (non-blocking) | `grep "state() === 'connecting'"` + check no `[disabled]` references the flag | Join submit only connecting-gated; no flag-bound disable | Join submit button (497-504) `[disabled]="state() === 'connecting'"`; `grep '\[disabled\][^>]*lobbySelfTestFlag'` → empty (exit 1) | `structural-b5.txt` S5 | PASS |
| 13 | U-7 (sustained window) | poller passes `media.getMicCaptureWindow()` to `classifyMicCapture` (per changes.md); window bounded (`.shift()` cap 24) + reset in `stopMicLevel` | window arg, not single sample; bounded + reset | confirmed in changes.md + diff; poller reads `getMicCaptureWindow()` (whole window), bounded cap 24 ≈3s, reset on `stopMicLevel`/device-change | changes.md + `structural-b5.txt` | PASS |

---

## Scenario → proof → result mapping (U-1..U-11)

| Scenario | Proves AC | Proof mechanism | Actual | Result |
|---|---|---|---|---|
| **U-1** silent frames ⇒ flat cumulative | AC2 | unit 1a (`mic-selftest.spec.ts`) | zero-energy frames ⇒ cumulative delta `< ENERGY_DELTA_EPSILON`, `audioLevel===0` — asserted | PASS |
| **U-2** quiet-working ⇒ strictly increasing | AC2, AC3 | unit 1b | `frameMeanSquare=4e-6` ⇒ cumulative strictly increases (`last-first ≥ 1e-7`), raw RMS ≈ 2e-3 < 0.01 — asserted | PASS |
| **U-3** SILENT window ⇒ flag (false-pass kill) | AC2, AC3, AC4 | unit 2a | flat-energy + sub-0.01 window ⇒ `classifyMicCapture==='silent'` ⇒ `nextMicWarningState(false,'silent',true)===true`; one above-0.01 level ⇒ `'working'` (threshold == in-call) | PASS |
| **U-4** RISING window ⇒ no flag (+ clear-on-fix) | AC3, AC5 | unit 2b | rising sub-0.01 ⇒ `'working'` ⇒ `nextMicWarningState(false,'working',true)===false`; `(true,'working',true)===false` (auto-clear) | PASS |
| **U-5** micActive=false ⇒ no flag | AC4 | unit 2c | `nextMicWarningState(*, *, false)===false` for `(false,'silent',false)` and `(true,'silent',false)` | PASS |
| **U-6** thin window ⇒ indeterminate ⇒ hold | AC6 | unit 2d | `<2` usable ⇒ `'indeterminate'`; `(false,'indeterminate',true)===false`; `(true,'indeterminate',true)===true` | PASS |
| **U-7** sustained ~3s window, not single frame | AC2 | grep + unit 1a/1b/2a | poller passes bounded, reset `getMicCaptureWindow()` to `classifyMicCapture` | PASS |
| **U-8** constraint parity deep-equal | AC1 | unit 3 | `audioCaptureConstraints(true,'dev-x')` deep-equals call-path object; no-device ⇒ no `deviceId` key; never `{exact:''}` | PASS |
| **U-9** Join has no flag-bound disable | AC5 | grep + (M-1 manual) | Join `[disabled]` is exactly `state() === 'connecting'`, no flag reference | PASS |
| **U-10** copy in BOTH surfaces; no new AudioContext/Analyser | AC3, NS10 | grep + git diff | `No sound detected` in both templates; 0 added analyser/context constructions | PASS |
| **U-11** B1/B2a/B2b/B2c specs stay green | scope containment | unit regression | `mic-energy`, `mic-capture-health`, `mic-sweep` all "all assertions passed" | PASS |

## MANUAL scenarios (M-1..M-3) — MANUAL-PENDING (NS5)

| Scenario | Proves AC | Proof mechanism | Actual | Result |
|---|---|---|---|---|
| **M-1** real dead device ⇒ flag in preview + dialog before join, Join enabled | AC2, AC3, AC4 | MANUAL — USER seat, localhost:4700 | NS5: un-headless-able (fake media tones every input). Not run; not fabricated. | MANUAL-PENDING |
| **M-2** real working mic ⇒ no flag AND call transmits (consistency) | AC4 | MANUAL — 2 real seats, localhost:4700 | NS5: un-headless-able. Not run; not fabricated. | MANUAL-PENDING |
| **M-3** switch silent→working clears flag within ~one window | AC5 | MANUAL — USER seat, localhost:4700 | NS5: un-headless-able. Not run; not fabricated. | MANUAL-PENDING |

---

## Optional app-render smoke (NOT a gate)

A Playwright (1.60.0, system chromium, `--use-fake-device-for-media-stream`) headless load of `http://localhost:4700/room/3f324d8be763` was attempted. The persistent test room has been **deleted**, so the SPA rendered its **"Room not found"** card instead of the lobby preview (`app-lobby-preview count: 0`). Console errors: **0**, page errors: **0** — the Angular SPA + room route bootstrap cleanly with no runtime crash, but this did **NOT** reach the lobby self-test surface, so it does not exercise the new `lobbySelfTestFlag` / `micTestFlagged` / `micTestDeviceLabel` bindings at runtime. Per the B5 instruction "if the route requires a real room, SKIP gracefully" (and to avoid creating test-room pollution), this optional smoke is recorded as **SKIPPED-GRACEFULLY** for the lobby surface. Runtime render of the new bindings is covered by MANUAL M-1..M-3. Evidence: `screenshots/lobby-smoke-b5.txt`, `screenshots/lobby-render-b5.png` (room-not-found card), `screenshots/lobby-smoke.mjs`. No fake-media "silent flag" test was attempted (NS5).

---

## Summary

- **Unit tests**: 4/4 spec files green ("all assertions passed"). The B5 `mic-selftest.spec.ts` covers U-1, U-2, U-3, U-4, U-5, U-6, U-8 (scenario-ID labelled blocks); the 3 existing specs (mic-energy, mic-capture-health, mic-sweep) regression-clean (U-11).
- **Builds**: frontend PASS (exit 0; only 3 pre-existing warnings, no TS errors), backend PASS (exit 0, clean tsc).
- **Structural**: 7/7 checks pass — Copy Lock `No sound detected from <device> — pick another` in BOTH lobby templates; flag gated to `mode()==='lobby'` (in-call dialog untouched); 0 new `AudioContext`/`createAnalyser`; `lobbySelfTestFlag` bound only to app-lobby-preview (420) + lobby dialog (533), not in-call (157); Join button non-blocking (`state() === 'connecting'` only); sustained bounded+reset window.
- **Console errors**: 0 (SPA bootstrap smoke); no runtime/page errors.
- **Evidence / screenshots count**: 10 files in `screenshots/` (4 unit `.txt`, 2 build `.txt`, 1 structural `.txt`, 1 smoke `.txt`, 1 smoke render `.png`, 1 smoke `.mjs`).
- **Deterministic scenarios (U-1..U-11)**: 11/11 PASS.
- **Manual (M-1..M-3)**: MANUAL-PENDING — un-headless-able per NS5; recorded, not fabricated.

## Verdict: **PASS**

All deterministic checks (unit U-1..U-11, both builds, all structural U-7/U-9/U-10) pass. The lobby self-test now reuses the SAME in-call `classifyMicCapture` + `nextMicWarningState` + `0.01` threshold + `audioCaptureConstraints` (no shadow copy, no new AudioContext/analyser, no new verdict logic) off a sustained bounded cumulative-energy window, surfacing a non-blocking copy-locked flag in both lobby surfaces — so the lobby verdict cannot drift from in-call reality (the R8 false-pass kill). The end-to-end real-device fidelity (M-1..M-3) is MANUAL-PENDING on the USER seat per NS5 (fake media cannot reproduce a silent mic).

STATUS: DONE (PASS)

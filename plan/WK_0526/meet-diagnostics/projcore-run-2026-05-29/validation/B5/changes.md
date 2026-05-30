# Batch-5 — Device self-test fidelity: no false pass (R8)

**Branch**: `feat/meet-diagnostics-audio-20260529` (B5 committed ON TOP of 4a50da2; no new branch, no merge)
**Commit**: `2c062ff`
**Author**: [dev] — Builder
**Date**: 2026-05-30

---

## User Report (verbatim — JROM / R8 / NS10)

> "perhaps one thing to add here or fix is to properly fix the self test on the user, if its truly not sending it should be flagged or can be flagged by the user on his test/configure devices, its unacceptable to pass that and yet when on a call it does not work perhaps we should look into fixing that as well"

---

## Root Cause (mechanism)

The lobby/pre-call "Mic level" meter and the device-dialog VU%/bar/meter are BOTH driven by `media.service.micLevel`, computed in `startMicLevel()` (media.service.ts:186-204) as an **INSTANTANEOUS single-frame** AnalyserNode RMS (`getByteTimeDomainData`, scaled ×3) every 125ms. That value carries **NO sustained-window energy verdict, NO 'silent' classification, and NO flag** — so it never disagrees with in-call reality and passes a mic that publishes silence. **That instantaneous-only meter is the false pass.**

The in-call path proves capture differently: it samples the outbound media-source `totalAudioEnergy`/`audioLevel` into a rolling ~5-6s window and runs `classifyMicCapture()` (mic-energy.ts:107) — flat cumulative energy + sub-`0.01` level ⇒ `'silent'`; rising cumulative energy ⇒ `'working'`. The lobby never applied that verdict.

**Fix (mechanism)**: feed the EXISTING single AnalyserNode's per-frame mean-square (already computed in `startMicLevel` before its sqrt×3 display scale) into a new pure cumulative accumulator, maintain a bounded ~3s rolling `EnergySample` window off that SAME analyser, and run it through the SAME `classifyMicCapture` + SAME `nextMicWarningState` + SAME `MIC_SILENCE_LEVEL_THRESHOLD=0.01` the in-call watchdog uses, surfacing a NON-blocking flag. No new AudioContext, no new analyser, no new verdict logic — so the lobby verdict can never drift from in-call reality (the exact R8 bug).

---

## Code Changes (per-file WHAT + WHY)

### `frontend/src/app/services/mic-energy.ts`
- **ADDED** one pure, framework-free, DOM-/AudioContext-/timer-free helper `accumulateEnergyFrame(prevTotal, frameMeanSquare): EnergySample`, returning `{ totalAudioEnergy: prevTotal + frameMeanSquare, audioLevel: sqrt(frameMeanSquare) }`.
  - **WHY**: `totalAudioEnergy` is a running cumulative (monotone non-decreasing) so `classifyMicCapture`'s last-first delta proves capture identically to the in-call media-source window; `audioLevel` is the **RAW RMS** (same units as the in-call media-source `audioLevel`) for the `0.01` corroboration — the ×3 stays display-only on `micLevel`. Negative/NaN frame input is treated as 0 (no NaN propagation). `classifyMicCapture`/`nextMicWarningState`/`audioCaptureConstraints`/`EnergySample` are REUSED unchanged.

### `frontend/src/app/services/media.service.ts`
- **EXTENDED** `startMicLevel` (inside the SAME existing `setInterval`, off the SAME single analyser): reuses the per-frame `meanSquare = sum/buffer.length` already computed before the display sqrt×3, accumulates it via `accumulateEnergyFrame` into a running cumulative total, and pushes the returned `EnergySample` into a bounded rolling window (cap 24 ≈ 3s @125ms; `.shift()` over cap). `micLevel.set(... ×3 ...)` is UNCHANGED (display).
- **ADDED** private fields `micEnergyCumulative` and `micCaptureWindow`; both RESET to 0/`[]` in `stopMicLevel` so a device change / leave clears stale energy.
- **ADDED** `getMicCaptureWindow(): EnergySample[]` returning a COPY (`.slice()`).
- **ADDED** import of `accumulateEnergyFrame` + `EnergySample` and the `MIC_CAPTURE_WINDOW_CAP` constant.
  - **WHY**: gives the lobby self-test a SUSTAINED cumulative-energy window off the ONE existing analyser (no new AudioContext/createAnalyser — single-analyser invariant, U-10).

### `frontend/src/app/pages/room/room.page.ts`
- **ADDED** `lobbySelfTestFlag = signal(false)` and `selectedAudioLabel` computed (selected mic's `MediaDeviceInfo.label`, fallback `'this microphone'` when empty/blank).
- **ADDED** a lobby self-test poller (`startLobbySelfTest` / `stopLobbySelfTest` / `pollLobbySelfTest`) mirroring the in-call watchdog lifecycle on a SEPARATE signal: a ~1s interval (`LOBBY_SELF_TEST_POLL_MS=1000`) that runs ONLY while `state()==='lobby'` AND `media.audioContextActivated()`. Each tick computes `micActive = microphoneRequested() && live+enabled local audio track`, then `lobbySelfTestFlag.set(nextMicWarningState(lobbySelfTestFlag(), classifyMicCapture(media.getMicCaptureWindow()), micActive))`. The poller self-stops when `state()!=='lobby'`.
- **WIRED** start into `startLobbyPreflight` and `reacquireLobbyStream` (after `micLevel.set`) and `enableMicPreview` (after AudioContext activation). **STOP + reset** in `cleanupCall` (join/leave). **Reset the flag** in `changeAudioDevice` (lobby branch) so a stale verdict doesn't bleed across devices.
- **REUSED** the already-imported `classifyMicCapture` + `nextMicWarningState` (no shadow copy).
  - **WHY**: the lobby flag becomes the SAME verdict the call would produce, on a non-blocking surface, with watchdog-grade lifecycle discipline (no leaked interval).

### `frontend/src/app/pages/room/room.page.html`
- **ADDED** `[micTestFlagged]="lobbySelfTestFlag()"` + `[micTestDeviceLabel]="selectedAudioLabel()"` to `app-lobby-preview` and to the LOBBY `app-device-dialog` (`mode="lobby"`). The in-call `app-device-dialog` (`mode="in-call"`) is NOT touched. The Join button's `[disabled]="state() === 'connecting'"` is UNCHANGED (non-blocking).

### `frontend/src/app/components/lobby-preview/lobby-preview.component.{ts,html,scss}`
- **ADDED** inputs `micTestFlagged = input(false)` + `micTestDeviceLabel = input('this microphone')`; a `role="status"` flag near the meter-row rendering `No sound detected from {{ micTestDeviceLabel() }} — pick another` ONLY when `micTestFlagged()`; a warning-toned `.mic-test-flag` style.

### `frontend/src/app/components/device-dialog/device-dialog.component.{ts,html,scss}`
- **ADDED** the same two inputs; the same `role="status"` flag in the vu-panel ONLY when `micTestFlagged() && mode()==='lobby'`; the same `.mic-test-flag` style.
  - **WHY (templates)**: a single non-blocking flag driven by the ONE `lobbySelfTestFlag` signal, copy-locked substring `No sound detected` present in BOTH templates.

### `frontend/src/app/services/mic-selftest.spec.ts` (NEW)
- Deterministic unit proof per NS5 (a fake-media "silent" Playwright test is impossible — Chrome tones every fake input). Test blocks start with the scenario ID: U-1 (silent ⇒ flat cumulative), U-2 (quiet-but-working ⇒ strictly increasing, sub-0.01 level), U-3 (silent window ⇒ 'silent' ⇒ flag; threshold boundary == in-call), U-4 (rising ⇒ 'working' ⇒ no flag + clear-on-fix), U-5 (micActive=false ⇒ no flag), U-6 (thin window ⇒ indeterminate ⇒ hold), U-8 (constraint parity deep-equal, never `{exact:''}`). Same convention as the existing specs (`npx tsx`, ESM `./mic-energy.js`, `node:assert/strict`, prints "mic-selftest: all assertions passed").

---

## Commits

- `2c062ff` — `[batch-5] lobby self-test fidelity: sustained cumulative-energy window reuses in-call classifyMicCapture + nextMicWarningState; non-blocking No-sound-detected flag in both lobby surfaces | scenarios: U-1..U-11, M-1..M-3`

---

## Standing Rules

None added. (Reuses the LOCKED in-call verdict + reducer + threshold + constraint builder verbatim; the lobby self-test must never get its own copy — a shadow copy would re-open R8.)

---

## Verification

### Unit specs — new + 3 existing all green (U-1..U-8, U-11 regression)
```
$ cd frontend && npx tsx src/app/services/mic-selftest.spec.ts && npx tsx src/app/services/mic-energy.spec.ts && npx tsx src/app/services/mic-capture-health.spec.ts && npx tsx src/app/services/mic-sweep.spec.ts
mic-selftest: all assertions passed
mic-energy: all assertions passed
mic-capture-health: all assertions passed
mic-sweep: all assertions passed
```

### Frontend build — PASS
```
$ cd frontend && npm run build
Application bundle generation complete. [3.396 seconds]
Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
```
Only PRE-EXISTING warnings (not B5): NG8113 DatePipe unused in RoomsPage; Stencil empty-glob; `@mediapipe/selfie_segmentation` non-ESM.

### Backend build — PASS
```
$ cd backend && npm run build
> tsc -p tsconfig.json   (clean, no errors)
```

### Structural self-checks (U-7, U-9, U-10)
- **U-10 (copy in both templates)**: `grep -rn "No sound detected"` → 1 hit in `lobby-preview.component.html:50` AND 1 hit in `device-dialog.component.html:55`. ✅
- **U-10 (no new analyser/context)**: `git diff 4a50da2 -- frontend/src/app/services/media.service.ts | grep '^+' | grep -E 'createAnalyser|new AudioContext|webkitAudioContext' | wc -l` → `0`. The single existing `createAnalyser` at startMicLevel is unchanged. ✅
- **U-9 (non-blocking Join)**: the Join `<button type="submit" class="primary-btn">` `[disabled]` is exactly `state() === 'connecting'` — no `lobbySelfTestFlag`/`micTest` reference. `lobbySelfTestFlag()`/`micTestFlagged` appear ONLY as the 2 input bindings (room.page.html:420, 533). ✅
- **U-7 (sustained window)**: the poller passes `media.getMicCaptureWindow()` (bounded `.shift()`-capped at 24, reset in `stopMicLevel`) to `classifyMicCapture`, never a single sample. ✅
- **In-call dialog untouched**: `app-device-dialog mode="in-call"` receives no `micTestFlagged` input; flag template gated on `mode()==='lobby'`. ✅

### Manual (NS5 — cannot be headless; fake-media tones every input)
- **M-1** (real dead device ⇒ flag in preview + dialog before join, Join enabled) — **MANUAL-PENDING** (USER seat, localhost:4700).
- **M-2** (real working mic ⇒ no flag AND call transmits) — **MANUAL-PENDING**.
- **M-3** (switch silent→working clears flag within ~one window) — **MANUAL-PENDING**.

---

## Caveats

- **PRE-EXISTING** (not introduced by B5): the frontend build warnings above (DatePipe unused in RoomsPage; Stencil empty-glob; mediapipe non-ESM).
- **REGRESSION**: none. B5 only ADDS the accumulator + lobby wiring; the in-call B2a/B2b/B2c paths (`verifyInitialCaptureEnergy`, `pollMicSilenceWatchdog`, `runMicRecoverySweep`, `sampleCaptureEnergy`), the in-call device-dialog, SFU/transport, and B3/B4/B6 are untouched. All 3 existing specs stay green (U-11).
- **NS5 limitation (not a gap)**: a fake-media Playwright "silent mic" test cannot exist — Chrome's `--use-fake-device-for-media-stream` emits a continuous tone on every fake input, so the accumulator always sees rising energy and `classifyMicCapture` always returns `'working'`. The "false pass is now caught" behavior is proven by the deterministic unit cases (hand-built FLAT-energy windows) + the MANUAL M-1..M-3 close-out. No Playwright "shows the flag" test was written or claimed.
- The lobby capture window only fills once the AudioContext is activated (mobile gates this behind "Tap to enable mic preview"); until then `getMicCaptureWindow()` is short → `classifyMicCapture` returns `'indeterminate'` → no premature flag (AC6 / U-6), consistent with the existing meter gating.

STATUS: DONE

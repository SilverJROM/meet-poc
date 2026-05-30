# Changes — Batch B2c (R10; AMENDS AC5) — Multi-device microphone fallback before warning

**Branch:** `feat/meet-diagnostics-audio-20260529` — cut-from / committed ON TOP of `1ba17b5` (B2b). B2c commit: **`4a50da2`**. No new branch, no merge.

---

## User Report (verbatim, JROM / NS11)
> "ok, can we use a fallback of the other available mics when one mic fails and when there is non just prompt the user about the error"

## Requirement (verbatim, R10)
> "On confirmed sustained silence (mic enabled+unmuted), the app re-acquires the current device once, then automatically tries each OTHER available microphone and adopts the first that produces audio energy (switching to it and notifying the user which device). ONLY when NO available microphone produces energy does it surface the error prompt. Recovery stays non-destructive (never zero audio tracks) and bounded to one sweep per silence episode (no thrash)."

## Root Cause (feature — 1-line what+where)
B2a locked silent-mic recovery to the SAME device only (`decideMicRecovery` returned `reacquire-same-device` → `keep-and-warn`). R10 lifts that lock: this batch adds a bounded, non-destructive **current-first multi-device sweep** between the re-acquire and the terminal warn — pure step fn + candidate builder + gate reducer + async orchestrator in `mic-energy.ts`, wired into both the join-time gate and the in-call watchdog in `room.page.ts`.

---

## Code Changes (per-file WHAT + WHY)

### `frontend/src/app/services/mic-energy.ts`
- **REWROTE `decideMicRecovery`** from the same-device-only contract (`alreadyAttempted` / `selectedDeviceId` → `reacquire-same-device`) to a **pure ordered-candidate STEP fn**. New `RecoveryInput` carries `candidateDeviceIds` (current-first) + `attemptedDeviceIds`; new `RecoveryAction = 'try-device' | 'keep-and-warn' | 'none'`. It returns `try-device` for the first unattempted candidate (candidate[0] = current ⇒ "re-acquire current once"; then each OTHER), `keep-and-warn` once all are attempted, `none` for any non-silent class or any false gate. WHY: the step-by-step decision that lifts the AC5 lock while keeping the union destruction-free.
- **ADDED `orderedMicCandidates(selected, devices, failed)`** — pure builder: current device FIRST (not excluded — re-acquiring it is step 1), others follow; deduped by deviceId AND groupId so `'default'`/`'communications'` aliases collapse to their physical twin; empty/failed deviceIds dropped. WHY: candidate hygiene (R10 §6).
- **ADDED `nextSweepGate(swept, classification, micActive)`** — pure reducer bounding to ONE sweep per silence episode (`shouldSweep` true only on the first silent poll); re-arms on `'working'` (energy returned) and on `micActive=false` (mute is a PAUSE, not a permanent consume); `'indeterminate'` unchanged. WHY: no thrash, mute-gated.
- **ADDED `runMicSweep(originalDeviceId, hooks)`** — pure async orchestrator (no DOM/timers; all I/O injected). Calls `decideMicRecovery` internally, acquires each candidate via the injected hook (models non-destructive replaceAudioTrack: null/throw = skip, old track kept), re-classifies, adopts the first `'working'`; on total failure restores the ORIGINAL device and returns `none-working`; aborts if muted/disabled mid-sweep. Result union (`adopted` / `none-working` / `aborted`) has NO zero-track value. WHY: the never-zero-audio wiring proof.

### `frontend/src/app/pages/room/room.page.ts`
- **Import**: dropped `decideMicRecovery` (now reached only through the orchestrator); added `nextSweepGate`, `orderedMicCandidates`, `runMicSweep`, type `SweepHooks`.
- **Signal `micSilentWarningMessage`** (default `"We can't detect sound from your microphone"`) — the single banner's message, swapped to the terminal copy on `none-working`. Reset in `cleanupCall`.
- **State `micSweepInProgress` + `micSweepDoneForEpisode`** — re-entrancy lock + one-sweep-per-episode bound; both reset in `cleanupCall` next to `initialCaptureEnergyChecked`.
- **`runMicRecoverySweep()` (NEW adapter)** — re-entrancy guard; enumerates devices → `audioInputs.set` → `orderedMicCandidates`; zero candidates ⇒ terminal warn. Builds `SweepHooks` (`acquire` = `media.replaceAudioTrack` + re-wire failure handlers / mic level / broadcast, mirroring the old re-acquire block; `gates` from the capture-track helpers; `classifyCurrent` = `classifyMicCapture(sampleCaptureEnergy(...))`; `currentLiveDeviceId` = `audioTrackDeviceId(captureAudioTrack())`). Applies the result: **adopted (different device)** → `syncSelectedAudioIdToTrack` (sets+persists), clear banner, `actionNotice` = `"Switched to <label> — your previous microphone had no sound"` + diagnostics; **adopted (same device re-acquired)** → clear banner, NO "Switched to" notice; **none-working** → terminal `micSilentWarning` "No working microphone detected — check your mic/permissions"; **aborted** → no-op. try/catch falls back to the terminal warn (never un-warned); finally clears the transient "Checking your microphones for sound…" notice.
- **`verifyInitialCaptureEnergy()`** — removed the inline same-device re-acquire/resample block; now: one-shot guard + gate + initial sample + classify, `if (classification !== 'silent') return` (U-8 preserved), then `micSweepDoneForEpisode = true; await runMicRecoverySweep()`.
- **`pollMicSilenceWatchdog()`** — on `!micActive`: clear window, **re-arm** `micSweepDoneForEpisode = false`, reduce banner to indeterminate(false). Added `if (this.micSweepInProgress) return;` after the micActive gate. Drives `nextSweepGate` (updates `micSweepDoneForEpisode`); banner: `'working'` → clear + reset message, `'indeterminate'` → keep, `'silent'` → owned by sweep; `if (gate.shouldSweep) await runMicRecoverySweep()`.

### `frontend/src/app/pages/room/room.page.html`
- Banner span `We can't detect sound from your microphone` → `{{ micSilentWarningMessage() }}`. Single surface unchanged; "Switch microphone" still calls `openInCallDeviceDialog()`.

### `frontend/src/app/services/mic-capture-health.spec.ts`
- Rewrote the old `decideMicRecovery` block (U-12..U-17, the removed `reacquire-same-device` contract) to the NEW step-fn contract: silent+nothing-attempted ⇒ `try-device`(current) [U-1]; current attempted ⇒ `try-device`(next other), NOT `keep-and-warn` [U-2 + old-behavior rejection]; all attempted ⇒ `keep-and-warn` [U-3]; working/indeterminate ⇒ `none` [U-8/U-9]; any gate false ⇒ `none` [U-10]; no candidates ⇒ `keep-and-warn` [U-11 step half]; empty-id skipped. Existing constraint/extractor/classify/B2b reducer tests left GREEN.

### `frontend/src/app/services/mic-sweep.spec.ts` (NEW sibling spec)
- `runMicSweep` (mocked acquire/classify/gates): U-4 (second working ⇒ adopt second, stop), U-5 (first working ⇒ adopt, no later acquire), U-12 (adopted carries id+label), U-6 (all silent ⇒ none-working + restore original last), U-7/U-22 (never-zero: harness models the single-live-track non-destructive contract, asserts count ≥ 1 throughout + at exit), U-23 (throw skipped), U-24 (null skipped + not classified), U-25 (all throw/null ⇒ graceful none-working + restore), muted-mid-sweep ⇒ aborted. `nextSweepGate`: U-15..U-19. `orderedMicCandidates`: U-20 (alias/group collapse, current-first), U-21 (failed skipped), U-11 (single-device ⇒ [current]), empty-id dropped.

---

## Commits
| hash | scenarios |
|------|-----------|
| `4a50da2` | U-1..U-25, M-1..M-3 |

---

## Standing Rules
None new. Reuses the B2a non-destructive `media.replaceAudioTrack` (adds-before-removes) + `getOutboundAudioSource` + `classifyMicCapture`; preserves the single B2b `micSilentWarning` surface.

---

## Verification

**Unit specs (tsx) — ALL GREEN:**
```
$ cd frontend && npx tsx src/app/services/mic-energy.spec.ts
mic-energy: all assertions passed
$ npx tsx src/app/services/mic-capture-health.spec.ts
mic-capture-health: all assertions passed
$ npx tsx src/app/services/mic-sweep.spec.ts
mic-sweep: all assertions passed
```

**Frontend build — GREEN:**
```
$ cd frontend && npm run build
Application bundle generation complete. [3.337 seconds]
Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
```
(Only PRE-EXISTING warnings: NG8113 unused DatePipe in RoomsPage, the @stencil empty-glob, the @mediapipe non-ESM note — none from B2c.)

**Backend build — GREEN** (B2c is FE-only; confirmed BE still clean on HEAD):
```
$ cd backend && npm run build
> tsc -p tsconfig.json
(no errors)
```

**No-new-meter grep — clean:**
```
$ git diff 1ba17b5 -- frontend/src | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"
NO NEW METER LINES (clean)
```

**Wiring greps (U-13 / U-14 / U-22):**
- `Switched to … your previous microphone had no sound` + `storeDevice(DEVICE_STORAGE.audioInput, …)` (via `syncSelectedAudioIdToTrack`) on the adoption path — room.page.ts:2356 + 2082.
- `No working microphone detected — check your mic/permissions` bound to `micSilentWarning` ONLY (single surface) — room.page.ts:2318/2372/2385.
- Sweep adapter body uses `media.replaceAudioTrack` ONLY (room.page.ts:2332). `removeAudioTrack()` (room.page.ts:2263) is the PRE-EXISTING B4 `recoverLocalAudioTrack` track-loss handler, NOT the sweep path.

**Smoke walk (build artifact):** frontend bundle generated; the only behavioral surfaces touched are the silent-mic recovery path (gated on confirmed silence) and the banner message binding — neither alters the steady-state call UI.

---

## Caveats

- **PRE-EXISTING — M-1/M-2/M-3 are MANUAL-PENDING (localhost:4700, USER seat).** Per NS5, Chrome fake-media emits a TONE on ALL fake inputs, so every fake mic classifies `'working'`. The multi-device ADOPTION path ("current silent, OTHER device adopted") and the bounded-one-sweep behavior **cannot be forced headless / are NOT Playwright-able**; they require a real machine with a real working mic plus a second mic that can be made silent (OS-mute or a dead-but-enumerated input). The deterministic proof is carried by the pure unit specs above (U-1..U-25). Do NOT fabricate a fake-media adoption result.
- **PRE-EXISTING — `mediaTrackDeviceId`/`audioTrackDeviceId` may return `''` for a track whose `getSettings().deviceId` is empty** (some browsers). The adapter falls back to the requested `deviceId` in the `acquire` hook (`audioTrackDeviceId(track) || deviceId`), so the adopted result still carries a usable id; `syncSelectedAudioIdToTrack` then reads the live track's actual id for persistence (same convention the existing replace paths use).
- **PRE-EXISTING — pre-existing build warnings** (unused DatePipe in RoomsPage, @stencil empty-glob, @mediapipe non-ESM) are unrelated to B2c and untouched.
- No REGRESSIONS: B2a constraints/extractor/classify and the B2b warn-state reducer truth table + watchdog lifecycle are unchanged (their specs stay GREEN); B2c only extends the recovery step fn and drives the SAME `micSilentWarning` surface with the new terminal message.

STATUS: DONE

# Review — Batch B2c (R10; AMENDS AC5) — Multi-device microphone fallback before warning

**Reviewer:** [reviewer] v2.0
**Diff reviewed:** `git diff 1ba17b5..4a50da2` (single commit `4a50da2` on top of B2b `1ba17b5`)
**Mode:** 1 (batch diff vs scenarios + brief)
**Date:** 2026-05-30

---

## Verdict

**STATUS: DONE (APPROVE)** — with all 9 load-bearing invariants verified in the DIFF (file:line cited below). The implementation is a faithful, behavior-equivalent realization of the projcore-approved design; the AC5 same-device lock is correctly lifted; non-destructive / bounded / mute-gated / single-surface invariants all hold; the unit specs are real input→output wiring proofs (not theater); M-1..M-3 are correctly carried as MANUAL-PENDING and not fabricated. No out-of-scope changes.

Two NON-blocking observations are recorded under **Concerns** (neither gates approval).

---

## Diff Summary

| File | + / − | What |
|------|-------|------|
| `frontend/src/app/services/mic-energy.ts` | +195 | `decideMicRecovery` rewritten to pure ordered-candidate STEP fn (`try-device`/`keep-and-warn`/`none`); new pure `orderedMicCandidates`, `nextSweepGate`, async `runMicSweep` orchestrator + types |
| `frontend/src/app/pages/room/room.page.ts` | +177/−~50 | thin `runMicRecoverySweep` adapter; `verifyInitialCaptureEnergy` refactored to sweep-on-confirmed-silence; `pollMicSilenceWatchdog` drives gate + banner + re-arm; `micSilentWarningMessage` signal; cleanup resets new state |
| `frontend/src/app/pages/room/room.page.html` | +1/−1 | banner span bound to `{{ micSilentWarningMessage() }}` (single surface) |
| `frontend/src/app/services/mic-capture-health.spec.ts` | +/− 64 | `decideMicRecovery` block rewritten to the new step contract (U-1..U-3, U-8..U-11) |
| `frontend/src/app/services/mic-sweep.spec.ts` | +342 (new) | `runMicSweep` / `nextSweepGate` / `orderedMicCandidates` proofs |

---

## Codex-Template Section Check (changes.md)

| Section | Present | Note |
|---------|---------|------|
| User Report (verbatim) | YES | NS11 quote, matches scenarios.md |
| Requirement (verbatim) | YES | R10 quote |
| Root Cause (mechanism-level) | YES | Function/contract level — "B2a locked recovery to SAME device (`decideMicRecovery` returned `reacquire-same-device`→`keep-and-warn`); R10 adds a bounded non-destructive current-first sweep between re-acquire and terminal warn". Mechanism-level (binding/contract), not symptom-level. PASS Rule 8. |
| Code Changes per-file WHAT+WHY | YES | Every file has WHAT + WHY |
| Verification | YES | unit specs + FE/BE build + greps + smoke walk |
| Caveats | YES | M-1..M-3 MANUAL-PENDING + empty-deviceId fallback + pre-existing warnings + no-regressions |

changes.md Codex-template complete → no REVISE on Rule 9.

---

## Load-Bearing Invariant Checks (the 9 the brief flagged)

### 1. NON-DESTRUCTIVE / never-zero-audio — PASS
- Sweep acquire path is `media.replaceAudioTrack(deviceId || undefined, (next)=>sfuClient.replaceAudioTrack(next))` ONLY — `room.page.ts:2331-2334`.
- No `removeAudioTrack()` / `recoverLocalAudioTrack()` / bare `track.stop()` of the current track added in the sweep/adapter body: `git diff …| grep '^+' | grep -E 'removeAudioTrack|recoverLocalAudioTrack|\.stop\(\)'` → **empty**. The `removeAudioTrack()` at `room.page.ts:2263` + `recoverLocalAudioTrack` at `:2237` are the PRE-EXISTING B4 track-loss handler (entered via `attachLocalTrackFailureHandlers` track-end events at `:2229`), structurally separate from `runMicRecoverySweep` — confirmed by reading 2222-2266.
- `runMicSweep` `SweepResult` union (`mic-energy.ts:` adopted | none-working | aborted) has NO value implying a removed/zeroed track; `none-working` restores the original device first (`mic-energy.ts` keep-and-warn branch acquires `originalDeviceId` before returning).
- **mic-sweep.spec.ts never-zero test is a REAL wiring proof, not a tautology:** the `makeHooks` harness MODELS the non-destructive contract — `live` starts at 1, the success path swaps `liveDeviceId` while keeping exactly one track, the null/throw paths KEEP the old (count unchanged), and `minObserved` records the floor on every acquire (including in the `catch` before re-throw). U-7/U-22 then asserts `minObserved() >= 1` ACROSS the sweep AND `liveCount() >= 1` at exit. The harness can observe a drop (it tracks `live` independently) — it just never produces one because the modeled contract forbids it. Genuine.

### 2. BOUNDED / no-thrash — PASS
- Exactly one sweep per episode via `micSweepDoneForEpisode` + re-entrancy `micSweepInProgress`.
- `nextSweepGate(swept,'silent',true)` returns `shouldSweep:true` on first silent poll, `shouldSweep:false` on the second (`swept` already true) — `mic-energy.ts` gate body; asserted U-15.
- Watchdog sets the re-entrancy guard BEFORE sampling: `if (this.micSweepInProgress) return;` at `room.page.ts:2578` sits AFTER the `micActive` gate and BEFORE `getOutboundAudioSource()` at `:2583`. `runMicRecoverySweep` sets `this.micSweepInProgress = true` synchronously at entry (`room.page.ts:2305`, before the first await). Re-entrancy closed.
- Join gate sets `this.micSweepDoneForEpisode = true` (`room.page.ts:2296`) BEFORE `await this.runMicRecoverySweep()` (`:2297`) — so the watchdog won't double-fire for the same episode.
- Re-arm ONLY on energy-return or mute/disable: watchdog `!micActive` branch sets `micSweepDoneForEpisode = false` (`room.page.ts:2573`); `nextSweepGate` re-arms (`swept:false`) on `'working'` and on `micActive=false`. `'indeterminate'` leaves the gate unchanged (U-17). No other re-arm path.

### 3. MUTE-GATED — PASS
- `decideMicRecovery` gate: `if (!micEnabled || !micUnmuted || !hasLiveAudioTrack) return {action:'none'}` (`mic-energy.ts`). U-10 asserts.
- `nextSweepGate`: `if (!micActive) return {swept:false, shouldSweep:false}` (`mic-energy.ts`). U-18 asserts shouldSweep false for all classes when micActive=false.
- Watchdog `micActive` gate at `room.page.ts:2571` early-returns before any sampling/sweep.
- `runMicSweep` re-reads `hooks.gates()` each loop iteration; a mid-sweep mute makes `decideMicRecovery` return `'none'` ⇒ orchestrator returns `{outcome:'aborted'}` — asserted by the muted-mid-sweep test in mic-sweep.spec.ts.

### 4. U-8 PRESERVED (quiet-but-working never swept) — PASS, trigger NOT widened
- `decideMicRecovery` first line: `if (input.classification !== 'silent') return {action:'none'}` (`mic-energy.ts`). Only `'silent'` is sweep-eligible.
- `verifyInitialCaptureEnergy` keeps `if (classification !== 'silent') return;` at `room.page.ts:2293` before any sweep.
- Watchdog: `'working'` clears the banner; `'silent'` is owned by the sweep; `'indeterminate'` reduced via `nextMicWarningState` — `room.page.ts:2594-2601`. The sweep only runs on `gate.shouldSweep`, which is only true on a `'silent'` poll. Trigger unchanged.
- mic-capture-health.spec.ts U-8/U-9 assert `'working'`→`'none'` and `'indeterminate'`→`'none'`.

### 5. ADOPTION NUANCE (same-device re-acquire emits NO "Switched to…") — PASS
- Adapter: on `adopted`, it always `syncSelectedAudioIdToTrack` + clears banner, then `if (result.deviceId !== originalDeviceId)` emits the `"Switched to <label> …"` notice; the ELSE branch (same device re-acquired) sets `this.actionNotice.set(null)` and logs "audio recovered via relaxed re-acquire" — NO switch notice. `room.page.ts:2348-2363`. Exactly the required nuance.

### 6. SINGLE warn surface — PASS
- Template has ONE `@if (micSilentWarning())` banner (`room.page.html:194`), span now `{{ micSilentWarningMessage() }}`. No second silent-mic banner introduced (diff touches only that one span).
- Both messages flow through `micSilentWarningMessage` only: default `"We can't detect sound from your microphone"`, swapped to `"No working microphone detected — check your mic/permissions"` on `none-working` / no-candidates / catch (`room.page.ts:2316, 2369, 2381`), reset to default on `working` and in `cleanupCall` (`room.page.ts:2007`). Single surface confirmed.

### 7. NO NEW METER — PASS
- `git diff 1ba17b5..4a50da2 -- frontend/src | grep -E "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"` → **empty**. Reuses `classifyMicCapture` + `sfuClient.getOutboundAudioSource()` (`room.page.ts:2583`) + `sampleCaptureEnergy`.

### 8. SCOPE — PASS
- Diff confined to `mic-energy.ts`, `room.page.ts`, `room.page.html`, the two spec files (per `--stat`). No SFU/transport, layout, auth, B3/B4/B5/B6 changes.
- Old `reacquire-same-device` contract fully replaced: `git grep -nE "reacquire-same-device|sweep-other-devices|nextMicRecoveryStep|buildSweepCandidates" 4a50da2 -- frontend/src` → **none in src**. No dead references to the removed action. (The scenarios.md `nextMicRecoveryStep`/`buildSweepCandidates`/`sweep-other-devices` names were folded into `decideMicRecovery`/`orderedMicCandidates`/`try-device` — projcore-approved, scenarios.md permits folding; judged by BEHAVIOR.)

### 9. TEST VALIDITY (lead.md Rule 11) — PASS
- Specs assert real input→output against the ACTUAL exported signatures (`decideMicRecovery(candidateDeviceIds/attemptedDeviceIds)`, `runMicSweep(originalDeviceId, hooks)`, `nextSweepGate(swept, classification, micActive)`, `orderedMicCandidates`). Not static "PASS" theater.
- U-/M- behaviors mapped: U-1..U-3 (step phases + explicit old-behavior `notStrictEqual('keep-and-warn')` rejection), U-4/U-5 (adopt first working + stop, acquireCalls asserted), U-6/U-7 (none-working + restore-last + never-zero), U-12 (id+label), U-15..U-19 (gate incl. mute-is-a-pause), U-20/U-21/U-11 (dedupe by deviceId+groupId, failed skipped, single-device→[current]), U-23/U-24/U-25 (throw/null non-fatal + not-classified + all-fail graceful), muted-mid-sweep→aborted. Equivalent assertions present.
- M-1..M-3 correctly carried as MANUAL-PENDING (fake-media tones ALL inputs ⇒ adoption path not headless-forceable) and NOT fabricated — changes.md Caveats + scenarios.md §M agree.

---

## Scenario Coverage + Brief Anchoring

| Scenario/AC | Behavior | Diff location | Brief field | Status |
|-------------|----------|---------------|-------------|--------|
| AC-C1 / U-1..U-3 | silence ⇒ try-device(current) → try-device(other) → keep-and-warn | `mic-energy.ts` decideMicRecovery; spec U-1..U-3 | AC5 lock LIFTED | COVERED |
| AC-C2 / U-4,U-5 | adopt FIRST working, stop on success | runMicSweep adopt branch; spec U-4/U-5 | adopt first 'working' | COVERED |
| AC-C3 / U-12,U-13,M-1 | persist+notify which device | `syncSelectedAudioIdToTrack`+`storeDevice` `:2350,2082`; "Switched to" `:2356` | adoption nuance | COVERED (M-1 MANUAL) |
| AC-C4 / U-6,U-7,U-14,M-2 | none-working ⇒ restore + single terminal warn | runMicSweep restore; `:2369` | restore original | COVERED (M-2 MANUAL) |
| AC-C5 / U-8,U-9 | quiet-but-working never swept | `classification!=='silent'⇒none` | U-8 preserved | COVERED |
| AC-C6 / U-15..U-19,M-3 | one sweep/episode; re-arm on working→silent; mute=pause | `nextSweepGate`; watchdog re-arm `:2573,2592` | bounded | COVERED (M-3 MANUAL) |
| AC-C7 / U-20,U-21,U-23,U-24 | dedupe deviceId+groupId; failed/throw/null skipped | `orderedMicCandidates`; runMicSweep skip | candidate hygiene | COVERED |
| AC-C8 / U-22,M-1,M-2 | replaceAudioTrack only, never zero | `:2331`; never-zero spec | non-destructive | COVERED (M MANUAL) |

Every diff change traces to an R10 brief field. No out-of-scope change. PASS Rule 10.

---

## Code Quality

- The orchestrator/adapter split is clean: pure decision logic (`mic-energy.ts`) is node-runnable and DOM/timer/AudioContext-free; all framework I/O is isolated in the adapter's `SweepHooks`. This is exactly the NS5 deterministic-proof shape.
- `try/catch/finally` in `runMicRecoverySweep` is correct: unexpected throw still falls back to the terminal warn (never un-warned), and `finally` always clears the re-entrancy lock + the transient notice. No lock-leak path.
- `aborted` branch leaves the banner untouched and re-sets the transient notice (cleared by `finally`) — correct: a mid-sweep mute is handled by the next watchdog poll's reducer.
- `none-working` restore is keyed on `currentLiveDeviceId() !== originalDeviceId`, avoiding a redundant re-acquire when the sweep never left the original.

## Convention Conformance

- Persistence via `syncSelectedAudioIdToTrack` → `storeDevice(DEVICE_STORAGE.audioInput, …)` matches the user-driven `changeAudioDevice` convention (`room.page.ts:804`) and the B4 recovery path (`:2250`). Consistent.
- Re-wiring after acquire (`attachLocalTrackFailureHandlers` + `getMicLevel` + `broadcastMediaState`) mirrors the pre-existing replace paths. Consistent.
- `cleanupCall` resets all new state (`micSweepInProgress`, `micSweepDoneForEpisode`, `micSilentWarningMessage`) alongside `initialCaptureEnergyChecked`. Lifecycle hygiene intact.

---

## Required Changes (if REVISE)

None.

---

## Concerns (NON-blocking — recorded, do not gate approval)

1. **Adoption notice surface is `actionNotice`, not a dedicated `.device-notice`.** scenarios.md Copy Lock §27 references "the `actionNotice`/`.device-notice` pattern" — the impl uses `actionNotice` (the same surface the B4 recovery path uses at `:2254,2265`). The non-negotiable (the notice NAMES the adopted device) is met, and `actionNotice` is an existing non-blocking surface, so this is within the "actionNotice OR device-notice" allowance. Flagged only so QA quotes the EXACT rendered string at M-1 against the Copy Lock. NOT a defect.
2. **M-1..M-3 remain unproven until a USER-seat localhost:4700 run with a real second silent-capable mic.** This is inherent (NS5 fake-media tones all inputs) and correctly disclosed — but the headline R10 outcome (auto-adopt + correct persisted device + audible to a 2nd participant) is NOT machine-verified by this batch. QA must carry these as MANUAL-PENDING and the run is not "live-validated" for the adoption path until JROM executes M-1/M-2/M-3. Recorded so it is not lost at the gate.

---

STATUS: DONE

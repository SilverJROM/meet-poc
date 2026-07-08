# codex55 CODE red-team CR1

## Findings

R1 is not clean. The pure `nextSweepGate` reducer models first retry, cooldown, attempt cap, duration cap, and re-arm correctly in isolation, and the existing `mic-sweep` spec passes. The bug is in the Angular adapter: `verifyInitialCaptureEnergy()` waits through a multi-second sample window, then hard-codes `micActive=true` when consuming the retry gate. If the user mutes, disables, or loses the live capture gate during that window, the code can burn a retry attempt and enter an aborted sweep without acquiring or testing any microphone.

I ran:

```bash
cd frontend && npx tsx src/app/services/mic-sweep.spec.ts
```

Result: PASS, `mic-sweep: all assertions passed`.

## NEW bugs

| severity | file:line | what breaks | concrete fix |
|---|---|---|---|
| High | `frontend/src/app/pages/room/room.page.ts:3489`, `frontend/src/app/pages/room/room.page.ts:3492`, `frontend/src/app/pages/room/room.page.ts:3501`, `frontend/src/app/services/mic-energy.ts:373`, `frontend/src/app/services/mic-energy.ts:375`, `frontend/src/app/services/mic-energy.ts:378` | `verifyInitialCaptureEnergy()` checks `captureGatePasses()` only before the delayed sample window, then calls `nextSweepGate(..., true, Date.now())` after sampling. A user mute/disable/track loss during that window is treated as active silence, so `nextSweepGate` increments `attempts` and returns `shouldSweep:true` even though the mic is no longer sweep-eligible. | Re-read `const micActive = this.captureGatePasses()` immediately before calling `nextSweepGate`; pass that value instead of hard-coded `true`. If false, reset/re-arm the gate and return without consuming an attempt. |
| High | `frontend/src/app/pages/room/room.page.ts:3502`, `frontend/src/app/pages/room/room.page.ts:3507`, `frontend/src/app/pages/room/room.page.ts:3516`, `frontend/src/app/services/mic-energy.ts:375`, `frontend/src/app/services/mic-energy.ts:378` | The initial-capture path persists the incremented gate state before proving a sweep will actually run. If `micSweepInProgress` is already true, `runMicRecoverySweep()` returns at its top guard and no recovery/acquire/classify work happens, but the attempt is already consumed. That violates the CR1 bar: no retry budget consumption without a real recovery sweep. | Check `this.micSweepInProgress` and `this.audioRecoveryInFlight` before consuming the gate, or make the gate update conditional on a successful decision to start `runMicRecoverySweep()`. The state mutation should happen only when a sweep is actually launched, or it should be rolled back when the runner refuses to start. |
| Medium | `frontend/src/app/services/mic-sweep.spec.ts:242`, `frontend/src/app/services/mic-sweep.spec.ts:295`, `frontend/src/app/services/mic-sweep.spec.ts:304`, `frontend/src/app/services/mic-sweep.spec.ts:325` | The R1 tests cover the pure reducer boundaries, but not the adapter-level acceptance boundary where attempts are consumed before `captureGatePasses()`, `micSweepInProgress`, or `audioRecoveryInFlight` is rechecked. The passing spec therefore does not honestly prove "must not consume retry budget without running recovery." | Add an adapter-level unit/harness test for `verifyInitialCaptureEnergy()` or extract a small pure caller reducer that proves: muted during the delayed initial sample does not increment attempts; in-flight sweep/recovery does not increment attempts; a real launched sweep increments exactly once and receives cooldown on completion. |

## Scenario trace

- `nextSweepGate` pure model: clean for first retry, cooldown, attempts cap, duration cap, working re-arm, indeterminate no-op, and inactive reset. Evidence: `frontend/src/app/services/mic-energy.ts:346-381`; tests at `frontend/src/app/services/mic-sweep.spec.ts:242-339`.
- `audioRecoveryInFlight` / in-flight sweep / mute consumption: not clean. Initial capture consumes gate state before fresh active/in-flight eligibility is proven. Evidence: `frontend/src/app/pages/room/room.page.ts:3489-3507`, `frontend/src/app/pages/room/room.page.ts:3515-3517`.
- Banner retry/exhausted copy after recovery: no proven stuck-banner bug under this pass. Successful adoption clears warning/message at `frontend/src/app/pages/room/room.page.ts:3557-3560`; working watchdog samples clear/reset at `frontend/src/app/pages/room/room.page.ts:3829-3831`.
- Tests: pure reducer tests are useful but insufficient for the CR1 false-positive consumption boundary.
- Platform/runtime: no separate platform break found in the changed code path.

STATUS: BUGS — initial-capture and in-flight guards can consume retry attempts without a real sweep

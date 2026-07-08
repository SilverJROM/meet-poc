# spark CODE red-team CR1
## Findings
## NEW bugs
| severity | file:line | what breaks | concrete fix |
| --- | --- | --- | --- |
| medium | `frontend/src/app/pages/room/room.page.ts:3501-3507`, `frontend/src/app/pages/room/room.page.ts:3822-3823,3843`, `frontend/src/app/pages/room/room.page.ts:3419-3422` | `nextSweepGate` state is updated before the `audioRecoveryInFlight` guard, so a silent tick can increment `attempts` and advance episode timing even when recovery is skipped (`!this.audioRecoveryInFlight` false). If an audio recovery is in flight while this race window exists, the gate can burn budget without executing `runMicRecoverySweep()`, which can hard-cap retries and show stale retry/exhausted behavior after the real recovery finishes. | Move the recovery-in-flight guard ahead of gate advancement or add an early-return branch that keeps `micSweepGateState` unchanged (or explicitly re-arm) when `this.audioRecoveryInFlight` is true. Then call `nextSweepGate` only when a sweep can actually be executed. |

## Scenario trace
STATUS: BUGS — attempt budget can be consumed without a real sweep when `audioRecoveryInFlight` is true.
1. Call `verifyInitialCaptureEnergy()` or the in-call `pollMicSilenceWatchdog()` and get `classification === 'silent'`.
2. `audioRecoveryInFlight` becomes true due a concurrent local audio recovery (`recoverLocalTrack`) and a race allows silent handling to proceed before recovery completes.
3. `nextSweepGate(...)` runs and stores incremented state (`attempts` advances).
4. `if (gate.shouldSweep && !this.audioRecoveryInFlight)` prevents `runMicRecoverySweep()` from running.
5. Retry budget is now partially consumed, and if this repeats can hit `MIC_SWEEP_MAX_ATTEMPTS`/duration cap without actual candidate recovery attempts.

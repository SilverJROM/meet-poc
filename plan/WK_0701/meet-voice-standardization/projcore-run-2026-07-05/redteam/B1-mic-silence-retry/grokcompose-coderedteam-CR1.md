# grokcompose CODE red-team CR1

## Findings

### Lens 1 — `nextSweepGate` reducer correctness

The pure reducer at `frontend/src/app/services/mic-energy.ts:346-381` correctly models the agreed contract: immediate first attempt (`attempts === 0` → consume + `episodeStartedAt = now`), cooldown deferral (`now < nextAllowedAt`), dual first-to-fire exhaustion (`attempts >= maxAttempts` OR wall-clock cap at `mic-energy.ts:320-329`), and full re-arm on `!micActive` or `'working'` (`mic-energy.ts:356-358`). Cooldown is caller-owned: consumption preserves `nextAllowedAt` (`mic-energy.ts:373-378`); completion sets it in `room.page.ts:3598-3601`. `'indeterminate'` preserves state without consuming (`mic-energy.ts:360-363`). Unit tests in `mic-sweep.spec.ts:242-340` honestly cover U-15–U-19 plus R1 cooldown, dual-bound, and micActive disjointness boundaries.

No reducer-level off-by-one or bound inversion found.

### Lens 2 — Attempt consumption without a real sweep

**Proven wiring defect.** Both silence-trigger call sites persist gate consumption *before* eligibility guards, and skipped sweeps do not set cooldown:

1. **Watchdog + `audioRecoveryInFlight`** — `pollMicSilenceWatchdog` calls `nextSweepGate` and writes `micSweepGateState` at `room.page.ts:3822-3827`, then only invokes the sweep when `gate.shouldSweep && !this.audioRecoveryInFlight` at `room.page.ts:3843`. If `audioRecoveryInFlight` is true, `attempts` increments but `runMicRecoverySweep` never runs and `nextAllowedAt` stays unset (cooldown is only applied in `runMicRecoverySweep` `finally` at `room.page.ts:3598-3601`). On the next ~1s poll, `nextAllowedAt === 0` bypasses the cooldown branch (`mic-energy.ts:369-371`), so another attempt can be consumed without a sweep. This violates the packet bar: "must not consume retry budget without running recovery."

2. **Join gate + in-flight watchdog sweep** — `verifyInitialCaptureEnergy` has no `micSweepInProgress` early-return (contrast `pollMicSilenceWatchdog` at `room.page.ts:3803`). Timeline: watchdog can classify `'silent'` with only two window samples (`classifyMicCapture` needs ≥2 at `mic-energy.ts:173`; window fills by ~2s while join gate finishes ~3.3s after publish). Watchdog consumes attempt 1 and enters `runMicRecoverySweep` (`room.page.ts:3517`). When the join gate later classifies `'silent'`, it calls `nextSweepGate` at `room.page.ts:3501-3506` (incrementing to attempt 2 with `nextAllowedAt` still 0 because the in-flight sweep has not reached `finally`), then `runMicRecoverySweep` returns immediately at `room.page.ts:3516` — **outside** the `try/finally`, so no cooldown is applied. One physical sweep can cost two attempts; repeated overlap can exhaust the 8-attempt / 90s budget without proportional `getUserMedia` work.

Mute/unmute and `devicechange` paths are clean: inactive mic resets gate before `nextSweepGate` (`room.page.ts:3797`, `3011`); mute never reaches the consumer.

### Lens 3 — Banner state after recovery

**Proven transient regression.** On adopted sweep success, `runMicRecoverySweep` clears the banner at `room.page.ts:3559-3560` but does not reset `micSilenceWindow` (only cleared at `room.page.ts:3771`, `3780`, `3796`, `3808`). The next watchdog poll re-classifies from stale pre-recovery samples (`room.page.ts:3813-3819`), hits the `'silent'` branch, and re-sets `"Still trying to restore your microphone…"` at `room.page.ts:3835-3840` even though the sweep just proved `'working'`. Banner clears again once fresh samples show increasing energy (`room.page.ts:3829-3831`), but the user can see false retry copy for several seconds after a successful recovery. Exhausted copy does not appear stuck after genuine `'working'` recovery — re-arm on `'working'` resets gate and clears the banner.

### Lens 4 — Test adequacy

Reducer tests are outcome-level and boundary-honest for the pure function. Gaps that currently hide the wiring bugs above:

- No scenario for gate persistence when `audioRecoveryInFlight` or `micSweepInProgress` blocks the sweep caller.
- No scenario for join-time `verifyInitialCaptureEnergy` overlapping the in-call watchdog on a shared `micSweepGateState`.
- No scenario asserting banner message after adopted sweep vs stale watchdog window.

These are test-coverage holes tied to proven defects, not standalone product bugs.

### Lens 5 — Platform / runtime

No new platform-specific breakage identified in the changed path. Cadence (`MIC_SWEEP_RETRY_INTERVAL_MS = 7_000` + sweep duration ≈ 9–11s inter-attempt) fits the 5–10s active-recovery intent. Track-failure recovery and silence watchdog remain state-disjoint by `micActive` gating, consistent with consensus. `npx tsx src/app/services/mic-sweep.spec.ts` passes locally.

## NEW bugs

| severity | file:line | what breaks | concrete fix |
|---|---|---|---|
| MEDIUM | `frontend/src/app/pages/room/room.page.ts:3822-3843` | `nextSweepGate` consumption is persisted before the `audioRecoveryInFlight` guard. When recovery is in-flight, `attempts` increments but no sweep runs and `nextAllowedAt` is never set; the next watchdog tick can consume again (cooldown branch at `mic-energy.ts:369` is skipped while `nextAllowedAt === 0`), draining retry budget without `getUserMedia` work. | Mirror the `micSweepInProgress` pattern: return early before `nextSweepGate` when `audioRecoveryInFlight`, **or** only commit gate state inside `runMicRecoverySweep` after re-entrancy guards pass, **or** roll back `attempts` when the sweep is skipped. |
| MEDIUM | `frontend/src/app/pages/room/room.page.ts:3501-3507`, `3516` | Join-time `verifyInitialCaptureEnergy` shares `micSweepGateState` with the watchdog but does not check `micSweepInProgress`. Watchdog can classify `'silent'` by ~2s and start a sweep; the join gate (~3.3s) then increments `attempts` again and calls `runMicRecoverySweep`, which returns at `3516` without entering `try/finally` (no cooldown). One sweep can burn multiple attempts; budget may exhaust early with fewer real sweeps than intended. | Add `micSweepInProgress` early-return before `nextSweepGate` in `verifyInitialCaptureEnergy`, or centralize gate consumption in `runMicRecoverySweep` after the `micSweepInProgress` check at `3516`. |
| LOW | `frontend/src/app/pages/room/room.page.ts:3557-3560`, `3813-3840` | After an adopted sweep clears `micSilentWarning`, the watchdog re-shows `"Still trying to restore your microphone…"` from stale `micSilenceWindow` samples until the rolling window refreshes — false retry copy after successful recovery. | On adopted / `'working'` sweep completion, clear `micSilenceWindow` (and optionally skip the `'silent'` banner branch while `micSweepInProgress` or for one poll after sweep success). |

## Scenario trace

**S1 — Join/watchdog overlap burns attempts (proven).**
1. Admit → `startMicSilenceWatchdog()` (`room.page.ts:2126`) and `verifyInitialCaptureEnergy()` (`room.page.ts:1939`) run concurrently.
2. t≈2s: watchdog window has 2 flat low-energy samples → `classifyMicCapture` → `'silent'` → `nextSweepGate` → `attempts:1`, `shouldSweep:true` → `runMicRecoverySweep` sets `micSweepInProgress=true` (`room.page.ts:3517`).
3. t≈3.3s: join gate classifies `'silent'` → `nextSweepGate` with `attempts:1`, `nextAllowedAt:0` → `attempts:2`, `shouldSweep:true` (`room.page.ts:3501-3506`) → `runMicRecoverySweep` no-op at `3516` (no `finally`, no cooldown).
4. Watchdog sweep completes → cooldown set once; net two attempts charged for one sweep.

**S2 — `audioRecoveryInFlight` phantom consumption (proven mechanism; narrow live window).**
1. Watchdog classifies `'silent'`, persists `attempts+1` (`room.page.ts:3822-3827`).
2. `audioRecoveryInFlight === true` → sweep skipped (`room.page.ts:3843`); `nextAllowedAt` unchanged.
3. Next poll: `nextAllowedAt === 0` → cooldown does not block (`mic-energy.ts:369-371`) → another `attempts+1` without sweep. Mechanism is proven; live trigger window is narrow because track-failure recovery usually drives `micActive` false first (`room.page.ts:3794-3799`), which re-arms the gate.

**S3 — False retry banner after adopted sweep (proven).**
1. Sweep returns `'adopted'` → `micSilentWarning.set(false)` (`room.page.ts:3559`).
2. `micSilenceWindow` still holds pre-recovery flat samples.
3. Next watchdog poll → `'silent'` → `"Still trying to restore your microphone…"` (`room.page.ts:3835-3840`) despite working mic.

**S4 — Reducer / re-arm / devicechange (clean).**
- `'working'` → `INITIAL_SWEEP_GATE_STATE` (`mic-energy.ts:356-358`); mute → re-arm (`room.page.ts:3797`); `devicechange` → re-arm (`room.page.ts:3011`). Dual bounds fire independently in spec (`mic-sweep.spec.ts:304-323`).

STATUS: BUGS — gate consumption is committed before sweep eligibility guards, allowing retry-budget drain without proportional recovery sweeps
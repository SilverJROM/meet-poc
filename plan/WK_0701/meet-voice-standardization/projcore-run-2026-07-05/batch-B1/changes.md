# Batch B1 — Changes

## User Report

Mic-silence self-heal could burn retry attempts without running a real recovery sweep when another sweep or audio recovery was already in flight, when the mic was muted during the initial sample window, or when the join gate overlapped the watchdog. After a successful recovery, stale silence samples could briefly re-show "Still trying to restore your microphone…", and a failed sweep could set terminal copy that the next poll immediately overwrote with retry copy.

## Root Cause

The pure `nextSweepGate` reducer was correct; the Angular adapter in `room.page.ts` persisted incremented gate state **before** re-validating sweep eligibility (`micSweepInProgress`, `audioRecoveryInFlight`, fresh `captureGatePasses()`). Skipped `runMicRecoverySweep()` calls exited at the top guard outside `finally`, so `nextAllowedAt` stayed unset and phantom consumption could cascade. Adopted recovery cleared the banner but not `micSilenceWindow`, and `none-working` set terminal banner copy that non-exhausted polls overwrote during cooldown.

## Code Changes

### `frontend/src/app/services/mic-energy.ts`

- Added `planMicSweepAttempt()` — pure guard wrapper that returns unchanged state when `sweepInProgress` or `recoveryInFlight` is true; otherwise delegates to `nextSweepGate` and exposes `consumed` for tests.
- Added `micSilenceWatchdogBannerMessage()` — centralizes watchdog-owned retry vs exhausted copy so sweep side-effects cannot own terminal messaging.

**Why:** Moves the CR1 acceptance bar ("never consume unless sweep-eligible") into a framework-free, tsx-testable function matching existing pure-reducer discipline.

### `frontend/src/app/pages/room/room.page.ts`

- `verifyInitialCaptureEnergy`: re-reads `captureGatePasses()` before planning; uses `planMicSweepAttempt` with both blockers; launches sweep only when `plan.shouldSweep`.
- `pollMicSilenceWatchdog`: uses `planMicSweepAttempt` (includes `audioRecoveryInFlight` blocker); banner via `micSilenceWatchdogBannerMessage`.
- `runMicRecoverySweep`: clears `micSilenceWindow` on `'adopted'`; removes terminal banner set on `'none-working'` (watchdog exhaustion is authoritative).

**Why:** Call sites now commit gate state only through the planner; window/banner hygiene prevents false retry copy after real recovery.

### `frontend/src/app/services/mic-sweep.spec.ts`

- Added CR1 adapter tests: blocked by `sweepInProgress`, blocked by `recoveryInFlight`, inactive mic re-arm, eligible consumption, stale-window vs cleared-window classify, banner message ownership.

**Why:** Proves no-consumption-while-blocked and banner/window cleanup without brittle Angular component harnesses.

## Autonomous decisions

None — implementation followed approved plan verbatim.

---

## CR2 correction (batch-B1-cr2)

### User Report

After CR1, `planMicSweepAttempt()` blocked all reducer transitions when a sweep or audio recovery was in flight. That prevented non-consuming re-arms on `working` or muted mic, leaving stale exhausted gate state after recovery. Blocked silent polls also hard-coded `exhausted: false`, so terminal copy could be replaced by retry copy during recovery.

### Root Cause

CR1's blocker fast-path returned unchanged state with `exhausted: false` before calling `nextSweepGate()`, conflating "do not launch/consume" with "do not apply any reducer transition."

### Code Changes

#### `frontend/src/app/services/mic-energy.ts`

- Refactored `planMicSweepAttempt()` to delegate-then-gate: always call `nextSweepGate()` first.
- `working` / `!micActive` re-arm paths apply `nextState` even under blockers (`shouldSweep: false`, `consumed: false`).
- Blocked `silent`/`indeterminate` preserve `state` unchanged but report `exhausted` from reducer output.

**Why:** Blockers suppress only consumption/launch; re-arm and exhaustion reporting stay reducer-authoritative.

#### `frontend/src/app/services/mic-sweep.spec.ts`

- Added 4 CR2 tests: `working + recoveryInFlight`, `working + sweepInProgress`, `micActive=false + blocker`, exhausted silent under `recoveryInFlight`.

**Why:** Proves blocked non-consuming transitions and exhausted reporting per synthesis-CR2.md.

### Autonomous decisions (CR2)

None — implementation followed approved plan verbatim.
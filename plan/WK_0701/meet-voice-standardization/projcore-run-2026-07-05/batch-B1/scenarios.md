# Batch B1 — Scenarios (R1 CR1 correction)

## S1 — No gate consumption while sweep in progress

**Given** `micSweepGateState.attempts === 2` and `micSweepInProgress === true`  
**When** `planMicSweepAttempt` is called with classification `'silent'` and `micActive === true`  
**Then** `nextState` is unchanged, `consumed === false`, `shouldSweep === false`

## S2 — No gate consumption while audio recovery in flight

**Given** `micSweepGateState.attempts === 2` and `audioRecoveryInFlight === true`  
**When** `planMicSweepAttempt` is called with classification `'silent'`  
**Then** `nextState` is unchanged, `consumed === false`, `shouldSweep === false`

## S3 — Mute/disable after delayed initial sample does not consume

**Given** armed gate (`attempts === 2`) and `micActive === false` after the verify sample window  
**When** `planMicSweepAttempt` classifies `'silent'`  
**Then** gate re-arms to `INITIAL_SWEEP_GATE_STATE`, `consumed === false`

## S4 — Eligible silent consumes exactly once

**Given** fresh gate (`attempts === 0`), no blockers, `micActive === true`  
**When** `planMicSweepAttempt` classifies `'silent'`  
**Then** `attempts === 1`, `consumed === true`, `shouldSweep === true`

## S5 — Adopted recovery clears stale silence window

**Given** pre-recovery flat low-energy samples in `micSilenceWindow`  
**When** sweep returns `'adopted'`  
**Then** `micSilenceWindow = []` so the next poll cannot re-show retry copy from stale data

## S6 — Exhausted banner ownership stays with watchdog

**Given** sweep returns `'none-working'` but gate is not exhausted  
**When** next watchdog poll runs during cooldown  
**Then** banner shows retry copy (`Still trying…`), not terminal copy set inside sweep  
**And** terminal copy appears only when `plan.exhausted === true` on poll

---

## CR2 scenarios (batch-B1-cr2)

### S7 — Working under blocker re-arms gate

**Given** armed gate (`attempts === 2`) and `recoveryInFlight === true` (or `sweepInProgress === true`)  
**When** `planMicSweepAttempt` classifies `'working'`  
**Then** `nextState === INITIAL_SWEEP_GATE_STATE`, `consumed === false`, `shouldSweep === false`

### S8 — Inactive mic under blocker re-arms

**Given** armed gate and `recoveryInFlight === true`, `micActive === false`  
**When** `planMicSweepAttempt` is called  
**Then** gate re-arms to `INITIAL_SWEEP_GATE_STATE` without consumption

### S9 — Exhausted silent under blocker preserves terminal reporting

**Given** exhausted gate (`attempts >= MAX`) and `recoveryInFlight === true`  
**When** `planMicSweepAttempt` classifies `'silent'`  
**Then** `nextState` unchanged, `exhausted === true`, `consumed === false`, `shouldSweep === false`
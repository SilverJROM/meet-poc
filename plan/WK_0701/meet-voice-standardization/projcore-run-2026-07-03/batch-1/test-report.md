# Test Report — Batch-1 (R1) — Persistent mic-silence self-heal

## Tested Against

- **Branch:** `feat/voice-standardization-batch-1-mic-silence-retry` (working tree on `main`)
- **Date:** 2026-07-03
- **Scope:** LOCAL only — no DEV deploy

## Unit Test Results

**Command:** `cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-sweep.spec.ts`

| # | Scenario | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| U-15 | First silent immediate; second after cooldown | `shouldSweep:true` then false mid-cooldown then true post-cooldown | Matches | PASS |
| U-16 | Working re-arms; new silent episode sweeps | zeros then `shouldSweep:true, attempts:1` | Matches | PASS |
| U-17 | Indeterminate unchanged | state preserved; no sweep | Matches | PASS |
| U-18 | micActive=false disarms all classes | re-arm + no sweep | Matches | PASS |
| U-19 | Mute pause; unmute fresh sweep | no sweep muted; sweep unmuted | Matches | PASS |
| R1-A | Retry-after-cooldown at 7000ms boundary | blocked at 6999ms elapsed; allowed at 7000ms | Matches | PASS |
| R1-B | Exhaustion by max attempts (8) | `exhausted:true, shouldSweep:false` | Matches | PASS |
| R1-C | Exhaustion by max duration (90s) | `exhausted:true, shouldSweep:false` | Matches | PASS |
| R1-D | Disjointness micActive true vs false | active+silent sweeps; inactive never sweeps | Matches | PASS |
| B2c-regression | Existing runMicSweep / orderedMicCandidates tests | all prior assertions green | Matches | PASS |

**Terminal output:** `mic-sweep: all assertions passed`

## Build

**Command:** `cd /home/agjrom/websites/meet-poc/frontend && npm run build`

| Check | Result |
|-------|--------|
| `ng build` | PASS — bundle generation complete (pre-existing Stencil/CommonJS warnings only) |

## Manual / E2E

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| M-1 | Dead-mic mid-call retry cadence | MANUAL-PENDING | Per testing protocol — dev_machine postfix regression |
| M-2 | Mic recovery clears banner + re-arms | MANUAL-PENDING | Validator / dev_machine scope |

## Screenshots

N/A — pure-logic batch.
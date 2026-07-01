# Batch B1 — Test Report

**Date:** 2026-07-01  
**Branch:** `fix/sfu-selfheal-20260701`

## Build

| Command | Result |
|---------|--------|
| `npm run build` | ✅ PASS (backend tsc + frontend ng build) |

## Targeted tests (B1 required-green)

| Command | Result | Notes |
|---------|--------|-------|
| `cd backend && npx vitest run tests/realtime-sfu.test.ts` | ✅ PASS (5/5) | Includes B1-R1-a fault inject cases |
| `cd frontend && npx tsx src/app/services/sfu-repro-harness.spec.ts` | ✅ PASS | BUG-REPRO tests — **failing-by-design vs desired self-heal** |
| `cd frontend && npx tsx src/app/services/sfu-recovery-epoch.spec.ts` | ✅ PASS | Epoch guard contract |
| `cd frontend && npx tsx src/app/pages/room/room-decisions.spec.ts` | ⚠️ PRE-EXISTING FAIL @ ~L400 (`missingPreflightPrereqs` speaker expectation) | BUG-REPRO-R1-mark-stalled block @ ~L300 runs before failure |

## Failing-by-design intent (validator audit)

These tests **pass today** because they assert the **current give-up outcome**:

| Test | Outcome asserted (not just call fired) |
|------|----------------------------------------|
| `BUG-REPRO-R1-406-subscribe-cap-give-up` | After cap: diagnostics quality `advertised-not-subscribed`, `subscribedClientIds` guard latched, `subscribeRetryAttempts > 7`, polled `subscribeIfNeeded` issues **zero** additional POST |
| `BUG-REPRO-R1-advertised-not-subscribed-stuck-give-up` | Same terminal outcome via transport-error retry path |
| `BUG-REPRO-R1-406-evidence-not-gum-error` | Evidence records 406 fields; `isLastGumErrorCandidate(406) === false` |
| `BUG-REPRO-R1-mark-stalled-give-up` | After cap: repeated polls return `mark-stalled`, never `recover` |
| `BUG-REPRO-R1-epoch-guard` | Stale epoch blocks bind |

**Expected flip:** B2/B3 implementations should make S3/S4/S6 **fail** until tests are updated to assert escalation.

## Not run (out of scope)

- Full `sfu-client.spec.ts` (pre-existing unrelated failure)
- Playwright e2e (deferred to B6 capstone per escape valve)
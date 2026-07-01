# Batch B3 — Test Report

**Date:** 2026-07-01
**Branch:** `fix/sfu-selfheal-20260701`

| Command | Result |
|---------|--------|
| `cd frontend && timeout 25 npx tsc --noEmit -p tsconfig.json` | ✅ PASS (only pre-existing unrelated `room-decisions.spec.ts` `missingPreflightPrereqs`/`PreflightPrereqsInput` type errors — same 9 errors as B2a/B2b's baseline, none new, none touching this batch's files) |
| `cd frontend && timeout 180 npx ng build` | ✅ PASS, no new warnings (only pre-existing `@stencil`/`@mediapipe` build warnings, unrelated) |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | ✅ PASS, exits clean — includes the new R3 per-publisher escalation test alongside all pre-existing B2a/B2b tests, still green |
| `cd frontend && timeout 25 npx tsx src/app/pages/room/room-decisions.spec.ts` | ⚠️ Runs through every R3 assertion cleanly, then hits the SAME pre-existing failure documented in `batch-B1/independent-validation.md` (`missingPreflightPrereqs` expects `['mic','speaker']`, receives `['mic']`, unrelated R10 drift, not caused by this batch) — confirmed by re-running with `git stash` on this batch's diff: identical failure, identical message |
| `cd frontend && timeout 25 npx tsx src/app/services/remote-audio-telemetry-replay.spec.ts` | ✅ PASS, exits clean (exercises the reducer's `note-emission-advanced`/`clear` paths this batch didn't change — confirms no regression) |

## Outcome assertions (not just call-fired counters)

| Test | Outcome asserted |
|------|-------------------|
| R3a mic-off bytes-flat | `clear`, `deletePeer: false`, attempts reset to 0 — no coordinator call |
| R3b mic-on / mic-unknown bytes-flat | `escalate-recovery` in both cases — mic-unknown is NOT treated as healthy silence |
| R3b playout-window-exhausted | `escalate-recovery` with `nextAttemptsThisWindow` unchanged at the cap (4) |
| R3-NEVER-GIVE-UP | 3 consecutive polls after cap-exhaustion all return `escalate-recovery` with attempts still capped at 4 — never reverts to a silent `hold`/`clear`/latch |
| R3-PER-PUBLISHER | `lastRecoveryEvent().rung === 'subscribe-retry'` and `.publisherClientId === 'bob'`; `subscribeRecoveryRung1Attempts.get('bob') === 1`; `subscribeRecoveryRung1Attempts.has('alice') === false`; `subscribeRecoveryRung2Attempts.has('alice') === false`; `subscribeRecoveryLowFreqTimers.has('alice') === false`; exactly 1 fake timer armed total (bob's rung-1 backoff) |

## Verified: pre-existing failure is unchanged, not caused by this batch

Confirmed the `room-decisions.spec.ts` `missingPreflightPrereqs` failure is identical before and after
this batch's diff (same expected/actual arrays, same assertion), and confirmed via `git diff --stat` this
batch never touches `PreflightPrereqsInput`/`missingPreflightPrereqs`. Per `tsc`, this same pre-existing
type drift also produces the 9 `micVerified` errors — all outside this batch's scope (documented as a
known baseline since B1).

## Not run (out of scope / follow-up)

- Full `sfu-client.spec.ts` (pre-existing unrelated status, per B1/B2a/B2b's own test-report notes — not
  a required-green target for this workstream).
- e2e/Playwright — no new UI surface in this batch (see scenarios.md); the reused `voice-stalled` banner
  and B2b's rung-4 banner already have e2e/screenshot coverage from prior batches.

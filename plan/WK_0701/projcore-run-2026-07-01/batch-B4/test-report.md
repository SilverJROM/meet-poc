# Batch B4 — Test Report

**Date:** 2026-07-01
**Branch:** `fix/sfu-selfheal-20260701`

## SEND-BACK iter 1 re-verification

All commands below were re-run in full after the iter1 fix (two new `markPublishAttemptFailed` call
sites + `escalatePublishFailure` at both terminal exits + 2 new coordinator tests) — same PASS status
across the board, plus the 2 new `TERMINAL-*-ESCALATES` assertions (see below) and a fresh e2e re-run to
confirm the UI still renders after the additional `room.page.ts` edits.

| Command | Result |
|---------|--------|
| `cd frontend && timeout 60 npx tsc --noEmit -p tsconfig.app.json` | ✅ PASS, clean |
| `cd frontend && timeout 60 npx tsc --noEmit -p tsconfig.spec.json` | ⚠️ Only the SAME pre-existing `room-decisions.spec.ts` `missingPreflightPrereqs`/`PreflightPrereqsInput` (`micVerified`) type errors documented as a known baseline since B1/B3 — confirmed via `git status` this batch never touched that file |
| `cd frontend && timeout 180 npx ng build` | ✅ PASS, no new warnings (only pre-existing `@stencil`/`@mediapipe` build warnings, unrelated) |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | ✅ PASS, exits clean — full pre-existing B2a/B2b suite (COALESCING, RESUBSCRIBE-ALL, NO-DUPLICATE-SUBSCRIBE, THROTTLE, EPOCH-GUARD, EPOCH-SAFETY-DURING-REJOIN, MID-CALL-NEVER-GIVES-UP, LIVE-MID-CONFLICT-FALLBACK, R3-PER-PUBLISHER) unchanged/green, plus 6 B4 assertions + 2 new iter1 `TERMINAL-*-ESCALATES` assertions |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-client.spec.ts` | ✅ PASS, exits clean — includes 1 new B4 test (real-`publish()` reset proof) |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-repro-harness.spec.ts` | ✅ PASS, exits clean (B2a/B2b never-give-up behavioral proof, unchanged) |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-epoch.spec.ts` | ✅ PASS, exits clean (epoch guard, unchanged) |
| `cd frontend && timeout 25 npx tsx src/app/pages/room/room-lifecycle.spec.ts` | ✅ PASS, exits clean |
| `cd frontend && timeout 25 npx tsx src/app/pages/room/room-diagnostics.spec.ts` | ✅ PASS, exits clean |
| `cd e2e && E2E_BASE_URL=http://localhost:4822 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4821 E2E_PROXY_PORT=4822 timeout 170 npx playwright test tests/sfu-b4-publish-recovery/sfu-publish-recovery-ui.spec.ts` | ✅ PASS (1/1) — R4c screenshot captured |

## Outcome assertions (not just call-fired counters)

| Test | Outcome asserted |
|------|-------------------|
| NEVER-PUBLISHED-ESCALATE | `handlerCalls===1` (shared executor actually ran); `publishRecoveryFailed()===false` after a simulated successful republish |
| NO-CLOBBER-HEALTHY | `handlerCalls===0` against a genuinely healthy `'published'` state — never touched |
| NO-CLOBBER-IN-FLIGHT | `handlerCalls===0` while `status==='publishing'` — never interrupted |
| UNRECOVERABLE-ON-FAILURE | `publishRecoveryFailed()===true` after the republish handler throws |
| CAPPED-WIRES-TO-ESCALATE | `handlerCalls===1` after driving `handleTransportStateChange()` into the `'capped'` decision — was a pure log-only dead end before this batch |
| THROTTLE-SHARED | Two subscribe-triggered rejoins consume the 2/2min budget (`sfuRejoinThrottled()===false` after both — sanity); a subsequent publish-triggered `escalatePublishFailure()` then throttles (`sfuRejoinThrottled()===true`) instead of executing a third rejoin, while `publishRecoveryFailed()===true` (not silently latched) |
| `sfu-client.spec.ts` reset test | A real `sfu.publish()` call (full mocked HTTP + PC flow, not the escalation path) reaches `status:'published'` AND clears a pre-set `publishRecoveryFailed:true` to `false` |
| e2e R4c screenshot | `.publish-recovery-unrecoverable-notice` visible with exact text "We couldn't restore your audio automatically. Please rejoin to reconnect." and a visible "Rejoin" button; absent before the debug hook fires |
| TERMINAL-TRANSCEIVER-FAILURE-ESCALATES (iter1) | Mirrors the transceiver-check-failure exit's exact sequence from a `'published'` state — `handlerCalls===1` (proves the fix actually fires; would be `0` without `markPublishAttemptFailed`, which is exactly the gap that shipped, then got caught, in the first pass); `publishRecoveryFailed()===false` after the simulated republish succeeds |
| TERMINAL-RETRY-CAP-ESCALATES (iter1) | Mirrors the retry-cap-exhaustion exit's exact sequence from an already-`'error'` state — `handlerCalls===1`; confirms `markPublishAttemptFailed` being a no-op there doesn't interfere with the escalation |

## Verified: pre-existing failure is unchanged, not caused by this batch

`git status --short frontend/src/app/pages/room/room-decisions.spec.ts` shows no modification by this
batch; the `missingPreflightPrereqs` type-check failure is the same baseline documented since B1/B3.

## Verified: no regression to the B2a/B2b throttled-rejoin extraction

Re-ran the full `sfu-recovery-coordinator.spec.ts` suite (not just the new B4 assertions) after extracting
`executeThrottledFullRejoin()` out of `runFullSfuRejoin()` — every pre-existing B2a/B2b assertion (rung-1/
rung-2 attempt shape, coalescing, throttle, epoch guard, resubscribe-all, no-duplicate-subscribe,
mid-call-never-gives-up, live-mid-conflict fallback, R3 per-publisher scoping) still passes unchanged.

## Verified: iter1 fix doesn't regress the e2e UI proof

Re-ran the same Playwright screenshot spec after the iter1 `room.page.ts` edits (two new
`markPublishAttemptFailed` calls) — still 1/1 pass, notice renders identically. Re-confirmed no orphaned
processes/rooms after this second run too.

## Verified: e2e port isolation, no orphaned state

The default e2e webserver ports (4720 backend / 4711 frontend) collide with an already-running live dev
backend on this host (`tsx watch backend/src/server.ts`, PID 2421063/2444048) — the Playwright run used
distinct `E2E_BACKEND_PORT=4820`/`E2E_FRONTEND_PORT=4821`/`E2E_PROXY_PORT=4822` instead of touching the
live process. Post-run: `ps aux` shows no orphaned processes on 4820-4822; `sqlite3` query confirms zero
`SFUB4PUBLISH*`-prefixed rooms remain in `data/meet-poc.sqlite` (cleaned up by the spec's
`afterAll`/`cleanupRoomsByPrefix`); the live dev backend (PID 2421063/2444048) was left running,
untouched.

## Not run (out of scope / follow-up)

- Full `sfu-client.spec.ts` end-to-end suite beyond the targeted new test was run in full above and is
  green (unlike B1-B3's test-report notes, which flagged it as "pre-existing unrelated status" — that
  status is not reproduced here; the whole file passes clean).

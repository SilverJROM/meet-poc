# Batch B2a — Test Report

**Date:** 2026-07-01
**Branch:** `fix/sfu-selfheal-20260701`

## SEND-BACK iter 2 re-verification (2026-07-01, converging)

| Command | Result |
|---------|--------|
| `cd frontend && timeout 60 npx tsc --noEmit -p tsconfig.json` | ✅ PASS (only pre-existing unrelated `room-decisions.spec.ts` errors) |
| `cd frontend && timeout 120 npx ng build --configuration development` | ✅ PASS, no new warnings |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | ✅ PASS, exits clean | Includes the new LIVE-MID-CONFLICT-FALLBACK-NEVER-GIVES-UP test |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-repro-harness.spec.ts` | ✅ PASS, exits clean |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-epoch.spec.ts` | ✅ PASS, exits clean |

`LIVE-MID-CONFLICT-FALLBACK-NEVER-GIVES-UP` asserts: 3 POSTs (initial + 2 forced-renegotiation retries,
all hitting the same live mid conflict) reach cap-exhaust → `needs-rejoin` emitted once, scoped to the
exhausted publisher → low-frequency continuation armed → firing it issues another subscribe attempt and
re-arms itself → `destroy()` clears everything, no leaked timers.

## SEND-BACK iter 1 re-verification (2026-07-01)

Every command below re-run under a hard `timeout 20`/`timeout 60`/`timeout 120` guard per the coordinator's
instruction — a hang now fails loudly instead of stalling the session.

| Command | Result |
|---------|--------|
| `cd frontend && timeout 60 npx tsc --noEmit -p tsconfig.json` | ✅ PASS (only pre-existing unrelated `room-decisions.spec.ts` errors) |
| `cd frontend && timeout 120 npx ng build --configuration development` | ✅ PASS (3.7s, no new warnings) |
| `cd frontend && timeout 20 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | ✅ PASS, exits clean | Includes the new MID-CALL-NEVER-GIVES-UP test |
| `cd frontend && timeout 20 npx tsx src/app/services/sfu-repro-harness.spec.ts` | ✅ PASS, exits clean |
| `cd frontend && timeout 20 npx tsx src/app/services/sfu-recovery-epoch.spec.ts` | ✅ PASS, exits clean |

**sfu-client.spec.ts is intentionally NOT a required-green target** (was never one — see B1's
test-report.md pre-existing-failure note). Root-caused why the whole-file run hangs under `npx tsx`:
the never-give-up low-frequency continuation re-arms forever, so ANY test in that large legacy-style file
that reaches the recovery path while NOT wrapped in `withFakeTimersAsync` leaves a real recurring timer
alive after the file's synchronous work finishes. Found one such pre-existing case (SFU-R3, `handleSfuPresence`
with an always-failing mock, no fake-timer wrapper) and added an explicit `sfu.destroy()` teardown so it
can't fire. The obsolete mid-call "permanently stops" test was deleted outright rather than adapted in
place — its replacement behavioral proof lives in the dedicated, fake-timed coordinator spec instead.

## Original targeted tests (B2a required-green, still green)

| Command | Result | Notes |
|---------|--------|-------|
| `cd frontend && npx tsx src/app/services/sfu-repro-harness.spec.ts` | ✅ PASS | Rewritten: asserts escalation (rung1→rung2→needs-rejoin) + never-give-up low-freq continuation, not the old give-up |
| `cd frontend && npx tsx src/app/services/sfu-recovery-epoch.spec.ts` | ✅ PASS | Unchanged — B1's epoch/cfSession predicate contract still holds |
| `cd frontend && npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | ✅ PASS | COORDINATOR-SHAPE (exact rung sequence + forceRenegotiation flags) + EPOCH-GUARD (stale in-flight bind skipped) + MID-CALL-NEVER-GIVES-UP (new, SEND-BACK iter 1) |
| `cd frontend && npx tsx src/app/pages/room/room-decisions.spec.ts` | ⚠️ PRE-EXISTING FAIL @ ~L400 (`missingPreflightPrereqs` speaker expectation) | Same pre-existing failure noted in B1's test-report.md; untouched by B2a |

## Outcome assertions (not just call-fired counters)

| Test | Outcome asserted |
|------|-------------------|
| `BUG-REPRO-R1-406-subscribe-cap-escalates` | Rung-1 fires ≥3 attempts, rung-2 fires ≥2 attempts, `needs-rejoin` fires exactly once, publisher stays `advertised-not-subscribed`, guard NOT left latched, then 3 low-frequency cycles each issue another POST + `throttled` event |
| `BUG-REPRO-R1-advertised-not-subscribed-stuck-escalates` | Same escalation + never-give-up outcome via a transport-error (non-406) failure |
| `BUG-REPRO-R1-406-evidence-not-gum-error` | 406 evidence fields recorded and retained through to `needs-rejoin`; still not classified as a GUM error |
| `COORDINATOR-SHAPE` | Exact rung sequence `retry:1,2,3 → renegotiate:1,2 → needs-rejoin:3`; POST body `forceRenegotiation` is `false` for the initial+rung-1 attempts and `true` for both rung-2 attempts |
| `EPOCH-GUARD` | A subscribe POST left in flight when `recoveryEpoch` is bumped (simulating a concurrent local reset/rejoin) resolves but does not bind — `subscribedTracks` stays empty |
| `MID-CALL-NEVER-GIVES-UP` | Mid-call cap-exhaust emits `needs-rejoin` + arms low-frequency continuation (not a permanent stop); firing the low-frequency timer issues another subscribe attempt and re-arms itself |

## Not run (out of scope)

- Full `sfu-client.spec.ts` (pre-existing unrelated failure, per B1)
- Playwright e2e (deferred to B6 capstone per escape valve)
- Live/DEV manual call verification (R2 is agent-measured through B6; human-audible gate is B9)

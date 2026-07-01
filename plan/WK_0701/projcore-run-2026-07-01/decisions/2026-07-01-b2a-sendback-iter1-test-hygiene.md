# Decision — B2a SEND-BACK iter 1: test placement + real-timer hygiene

**Date:** 2026-07-01
**Batch:** B2a (iter 1 correction)
**Status:** Directed by coordinator, executed as specified

## Decision

1. The mid-call never-give-up production fix (`scheduleMidCallSubscribeRetry` cap-exhaust now escalates
   into `armSubscribeRecoveryLowFrequencyRetry` instead of permanently stopping) is unchanged from the
   first attempt at closing this gap.
2. The test proving it was moved OUT of `sfu-client.spec.ts` entirely (deleted, not adapted) and INTO
   `sfu-recovery-coordinator.spec.ts` as `MID-CALL-NEVER-GIVES-UP`.
3. A pre-existing, unrelated test in `sfu-client.spec.ts` (SFU-R3, ~L1856) got an explicit `sfu.destroy()`
   teardown it didn't need before.

## Why

- `sfu-client.spec.ts` is a large (2099-line) legacy-style file that mixes `withFakeTimersAsync`-wrapped
  tests with plain real-timer tests, run as a single `npx tsx` process. The never-give-up low-frequency
  continuation (B2a's core invariant) re-arms a real timer forever once armed under real timers — so ANY
  test in that file that reaches the recovery path without a fake-timer wrapper leaves the whole-file
  process unable to exit.
- SFU-R3 calls `handleSfuPresence` with an `http.post` mock that always throws, outside any fake-timer
  wrapper. Before B2a, hitting the old flat cap eventually just stopped (bounded, ~15s of hidden real
  time). After B2a's never-give-up change, the same test now arms an unbounded real 30s recurring timer.
  This was a real, traced root cause (confirmed via a temporary real-timer stack-trace probe, since
  removed) — not guesswork.
- Rather than auditing the whole file for every such latent case, the fix scope was kept to: (a) never
  add a NEW real-timer risk in this file (hence deleting the mid-call test outright instead of writing a
  new real-timer-adjacent one), and (b) patch the ONE traced pre-existing case (SFU-R3) with a one-line
  `sfu.destroy()` teardown.
- `sfu-client.spec.ts` was never a required-green gate for this batch (B1's test-report.md already noted
  a pre-existing unrelated failure there) — the coordinator's DONE criteria for this correction explicitly
  named `sfu-recovery-coordinator.spec.ts` + `sfu-repro-harness.spec.ts` + `sfu-recovery-epoch.spec.ts` +
  `ng build`, not the whole legacy file.

## How to apply

- B2b and later batches: if a NEW test needs to exercise the recovery/never-give-up path, use
  `withFakeTimersAsync` (or add it to `sfu-recovery-coordinator.spec.ts`) — never assume a test that
  reaches subscribe failure will naturally terminate under real timers anymore.
- Wrap every targeted `npx tsx` spec run in `timeout <N>` going forward so a regression of this class
  fails fast instead of hanging the session.

# Review — Batch-1 (R1) — Persistent mic-silence self-heal

## Summary

Replaced the one-shot `nextSweepGate` boolean latch with a bounded retry reducer and wired it through the mic-silence watchdog, join-time energy gate, and devicechange handler. Matches `deliberation/T1-mic-silence-retry/consensus.md` without scope creep.

## Consensus alignment

| Requirement | Status |
|-------------|--------|
| Pure `now`-injected reducer, no `Date.now()` inside | ✓ |
| Constants 7s / 8 attempts / 90s dual bound | ✓ |
| Re-arm on working, mute, devicechange | ✓ |
| Full `runMicSweep()` resweep each cycle | ✓ (orchestrator untouched) |
| Banner: retry vs exhausted copy | ✓ |
| `!audioRecoveryInFlight` guard | ✓ |
| No regression to track-failure paths | ✓ (handlers unchanged; disjointness tested) |

## Diff footprint

| File | Δ |
|------|---|
| `mic-energy.ts` | +74 / -10 (reducer rewrite + constants) |
| `room.page.ts` | +58 / -20 (state + wiring) |
| `mic-sweep.spec.ts` | +117 / -27 (AC-C6 rewrite + R1 tests) |

## Risks addressed

- **Retry storm:** dual bound + 7s post-completion cooldown — tested at reducer level.
- **Double recovery:** `audioRecoveryInFlight` guard + disjointness test (`micActive` false never sweeps).
- **Stale banner:** watchdog sets phase-appropriate copy each silent poll.
- **devicechange gap:** re-arm added after `refreshDevices()`.

## Residual / follow-up

- Manual dev_machine postfix regression (M-1/M-2) deferred to validator per testing protocol — not a code deferral (no TODO/FIXME left in tree).
- Branch `feat/voice-standardization-batch-1-mic-silence-retry` named in brief; commit on that branch is coordinator/implementer handoff step.

## Verdict

**PASS (LOCAL)** — targeted unit tests green, build green, consensus faithfully implemented.
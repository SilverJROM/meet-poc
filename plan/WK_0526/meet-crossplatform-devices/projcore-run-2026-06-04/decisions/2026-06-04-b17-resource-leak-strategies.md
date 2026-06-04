# Decision: B17 Resource Leak Strategies

Date: 2026-06-04

## Context

B17 needed surgical fixes for four confirmed resource leaks without changing call behavior.

## Decisions

1. Recorder source replacement uses disconnect-before-add for an existing `clientId`.
   - Reason: preserves recorder behavior while ensuring a reconnect cannot leave the old node connected.

2. Active-speaker dedupe lives inside `add()`.
   - Reason: `observe()` already removes on normal stream changes, but enforcing the invariant at the graph creation boundary prevents duplicate per-peer analyser work from any add path.

3. SFU subscribe backoff timers use a separate tracked set.
   - Reason: keeps retry behavior and `planSubscribeRetry` untouched while giving teardown the same cleanup control it already has for stuck watchdogs.

4. Debug tracks use deterministic prune/drop-on-ended plus a cap, not `WeakRef`.
   - Reason: deterministic behavior is easier to prove in `npx tsx` specs, and the goal is only to stop the debug registry from pinning ended tracks.


# Implementation Plan

## B0 Planning and Lineup

Lock requirements, queue, diagnostics summary, and runtime model availability. Because Sonnet is unavailable without credentials, use Codex/Spark/Grok-capable roles where possible while preserving independent validation.

## B1 Read-Only Reproduction

Collect evidence from diagnostics and current tests:
- affected session counters
- SFU presence/subscription state
- existing reconnect tests
- Peer2 relay liveliness

Exit: documented mechanism and failing gap.

## B2 Subscription Recovery Fix

Add a bounded resubscribe path for stalled inbound audio:
- expose a public `resubscribePublisher(clientId, reason)` or equivalent on `SfuClientService`
- tear down local subscription bookkeeping and close current mids if present
- schedule retry through the existing remote publisher roster/effect
- avoid retry storm with existing retry caps/state

Exit: tests cover stalled bytes causing resubscribe request.

## B3 Reconnect/Presence Cleanup Audit

Verify server close/resume/expire paths delete stale SFU presence and client resume paths remove old subscriptions. Patch only if a gap remains after direct inspection/tests.

Exit: reconnect test still shows exactly one current subscription set, not old ghosts or zero usable tracks.

## B4 Regression Tests

Run focused unit tests and build. Add/extend tests for the new decision/recovery behavior and existing SFU reconnect coverage where feasible.

## B5 Peer2 Field Proof

Use Peer2 relay scripts to join a DEV/live call and validate inbound audio counters both ways. Record proof in `validation/final-peer2-proof.md`.


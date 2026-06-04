# Decision — FIX2 mid-call subscribe retry

## Decision
Use a dedicated per-publisher-session/per-track mid-call retry controller around `subscribeNewRemoteTracks()` instead of reusing the join-path retry/version effect.

## Rationale
The join retry path short-circuits once `subscribedClientIds` contains the publisher, and its first-frame gate is poisoned for mid-call audio when camera frames already arrived. A separate retry controller can use the same bounded backoff plan while directly retrying only the missing mid-call track.

## Consequences
- No join-path retry behavior changes.
- No changes to transactional `doSubscribeTracks()` internals.
- Retry is bounded, direct, and state-derived.
- Per-track keys prevent one failed/capped track from poisoning later distinct tracks in the same publisher session.

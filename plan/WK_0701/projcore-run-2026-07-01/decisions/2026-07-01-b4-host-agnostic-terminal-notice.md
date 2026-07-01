# Decision — B4 terminal publish-recovery notice is host-agnostic, unlike R9's quiet-guest interim notice

**Date:** 2026-07-01
**Batch:** B4 (R4 publish/PC-failure recovery)

## Context

The existing `initialPublishFailureNotice` (interim, pre-B4) is host-gated via `shouldShowAudioFailNotice
({isHost})` — R9's "quiet-guest" design: guests get silent background retry + a host-side badge instead
of a blocking notice, to avoid noisy interim friction for non-hosts while auto-retry is still working.

## Decision

B4's NEW terminal notice (`publishRecoveryUnrecoverableNotice`, driven by `sfuClient.publishRecoveryFailed`)
is deliberately **not** host-gated — it shows to whichever user's own publish could not be restored,
host or guest alike.

## Why

R4c's acceptance criterion is explicit: "if unrecoverable, the UI tells the user exactly what failed."
"The user" here is the affected participant, not the host — this is about *your own* audio, not a
room-wide health signal the host needs to triage. Applying R9's host-gate to this notice would mean a
guest whose audio silently never recovers gets zero UI feedback ever (the exact silent-failure outcome
north-star #1 forbids), since nothing else in the app tells a guest their own mic never actually
published.

## Scope of the deviation

Only the NEW terminal notice is host-agnostic. The pre-existing interim `initialPublishFailureNotice`
(shown while `publishInitialSfuWithRetry` is still within its 3-attempt retry budget) is untouched and
stays host-gated — R9's "don't show interim friction to guests" intent is preserved for the part of the
flow it was designed for. This decision only concerns the genuinely-unrecoverable end state.

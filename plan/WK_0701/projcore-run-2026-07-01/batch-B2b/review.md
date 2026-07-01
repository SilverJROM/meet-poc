# Batch B2b — Self Review

## Scope adherence

- ✅ Rung-3 full local SFU rejoin + rung-4 visible UI only, consuming B2a's existing `needs-rejoin`
  marker/coordinator/epoch guard/`canRunSubscribeRecovery()` as-is — none of those rewritten.
- ✅ Did not re-getUserMedia: the rotation reuses the existing `resetForTransportRecovery()` +
  `transportRecoveryHandler` production path (already sources tracks from `MediaService`).
- ✅ Did not re-plumb the WS `sfu-publish` announce: same reused path already calls
  `announceSfuPublishState()`.
- ✅ Did not touch B3 (stalled-audio playout)/B4 (publish recovery)/B5 (diagnostics page) beyond the
  agreed carve-outs (emitting `sfu-rejoin`/`unrecovered-visible` events + the rung-4 banner + a data-only
  `recoveryLadder` diagnostics field, not a page redesign).
- ✅ Coalescing, throttle, and resubscribe-all are the only genuinely new mechanism pieces — verified
  each independently in the fake-timed spec (scenarios.md S1-S9).

## Risks / caveats

- **Accepted collateral, not a bug:** a coalesced rejoin rotates the entire local PC, so previously-healthy
  peers' subscriptions drop and rebuild too (see changes.md "Accepted collateral"). This is the explicit
  meaning of "local transport/session rotation" in the B0 consensus.
- **`subscribeAllAdvertisedRemotes()`'s error handling is intentionally simpler than `subscribeIfNeeded`'s:**
  it does not special-case `LiveMidConflictError` the way `subscribeIfNeeded`'s catch does (no dedicated
  `scheduleLiveMidConflictRenegotiationRetry` branch) — any failure, including a mid conflict, falls back
  into the generic `scheduleRecoveryEscalation()` ladder instead. This is a reasoned simplification: the
  resubscribe loop is sequential and awaited one publisher at a time on a freshly-rotated PC, so a genuine
  mid conflict across two publishers subscribing in the SAME rejoin pass should be effectively unreachable
  (unlike the steady-state concurrent-subscribe paths where that specialized retry exists). If it ever
  does fire, the generic ladder still recovers the publisher (rung-1 → rung-2 → needs-rejoin again) — never
  silent, just via a slightly different route than the steady-state path.
- **Redteam surfaces #2 (ghost `<audio>` elements) and #4 (defer-to-in-flight-ICE-recovery)** are addressed
  by reasoning + existing, already-tested machinery (`RemoteAudioService.syncPeers()`'s stream/track
  identity diff; B2a's own `transportRecoveryInFlight`/`Scheduled` flags) rather than a new dedicated unit
  test — both would require an Angular component harness or duplicating private ICE-recovery-timer
  machinery disproportionate to the unchanged logic being exercised. Documented explicitly in changes.md's
  redteam-mapping table for validator scrutiny rather than silently assumed.
- **`e2e/fixtures/auth.ts`'s `loginAsJrom()` has a pre-existing, unrelated ambiguous-locator bug**
  (since `1fbc273`, WK_0623 passwordless-Telegram-login) — worked around locally in the new e2e spec
  rather than fixed globally, to stay surgical. Flagged for follow-up.

## Verdict

READY for independent validation.

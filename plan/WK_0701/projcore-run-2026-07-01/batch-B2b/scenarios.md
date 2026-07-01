# Batch B2b — Scenarios (R2 completion: rung-3 full SFU rejoin + rung-4 visible unrecovered UI)

| ID | Scenario | Expected | Status |
|----|----------|----------|--------|
| S1 | Bob and alice both exhaust rung-2 in the same synchronous tick (two `needs-rejoin` triggers, no await between) | Exactly ONE full rejoin (`transportRecoveryHandler` invoked once), not two | ✅ tsx (`COALESCING`) |
| S2 | The one coalesced rejoin completes | EVERY advertised remote publisher is resubscribed afterward — not only the publisher whose exhaustion triggered it (the rotation drops every existing subscription, including previously-healthy ones) | ✅ tsx (`RESUBSCRIBE-ALL`) |
| S3 | A publisher's guard is already claimed by a racing subscribe path (e.g. `handleSfuPresence`) by the time the rejoin's resubscribe loop reaches it | Skipped, not double-subscribed (no duplicate POST) | ✅ tsx (`NO-DUPLICATE-SUBSCRIBE`) |
| S4 | A rejoin's republish is still in flight when an unrelated reset bumps `recoveryEpoch` underneath it | Once the republish resolves, the rejoin does NOT resubscribe on the now-stale epoch (no ghost/duplicate binds) | ✅ tsx (`EPOCH-SAFETY-DURING-REJOIN`) |
| S5 | 1st full rejoin | Proceeds immediately (empty throttle window) | ✅ tsx (`THROTTLE`) |
| S6 | 2nd rejoin attempted 5s after the 1st (inside the 15s window) | Blocked; `unrecovered-visible` rung emitted; `sfuRejoinThrottled` signal → true | ✅ tsx (`THROTTLE`) |
| S7 | 2nd real rejoin attempted 25s after the 1st (past 15s, still inside 2min) | Proceeds; `sfuRejoinThrottled` clears | ✅ tsx (`THROTTLE`) |
| S8 | 3rd rejoin attempted 45s after the 1st (2 rejoins already fired inside the 2min window) | Blocked by the ≤2/2min cap; still visibly unrecovered | ✅ tsx (`THROTTLE`) |
| S9 | Rejoin attempted 225s after the 1st (past the 2min window) | Proceeds — never a permanent stop | ✅ tsx (`THROTTLE`) |
| S10 | Rung-4 banner + Retry button, rendered DOM | `.sfu-rejoin-unrecovered-notice` visible with an actionable "Retry" button once `sfuRejoinThrottled()` is true; absent otherwise; clicking Retry does not crash the call | ✅ Playwright screenshot (`screenshots/rung4-unrecovered-banner.png`) |
| S11 | Existing B2a coordinator-shape/epoch-guard/never-give-up tests | Still green — the new `handleNeedsRejoinTrigger()` call added at every `needs-rejoin` emission site no-ops gracefully (logs, doesn't throw) when no `transportRecoveryHandler` is registered (as in those unit tests) | ✅ tsx (`sfu-recovery-coordinator.spec.ts` full file, `sfu-repro-harness.spec.ts`, `sfu-recovery-epoch.spec.ts`) |

**Reuse, not reinvention:** the rotation itself (close old PC, clear sub state, bump `recoveryEpoch`,
create new PC + fresh `cfSessionId`, reuse `MediaService`'s live tracks, announce over WS) is the
EXISTING `resetForTransportRecovery()` + `transportRecoveryHandler` production path that ICE-transport-
recovery already exercises — not re-implemented here. Only the coalescing lock, the ≤1/15s+≤2/2min
throttle, the explicit `subscribeAllAdvertisedRemotes()` resubscribe step, and the rung-4 signal/UI are
new. See changes.md for the elite-redteam surface mapping.

**Out of scope for B2b (approved, per brief):** B3 (stalled-audio playout recovery), B4 (publish
recovery), B5 (diagnostics page redesign — B2b only adds a `recoveryLadder` data field to the existing
snapshot, not a page). A total local-publish failure during the rejoin's republish (handler throws) falls
through to the pre-existing `initialPublishFailureNotice` banner/retry flow — a different, already-handled
failure class (local publish broken vs. remote subscribe broken), not re-plumbed here.

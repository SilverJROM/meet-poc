# Batch B4 — Scenarios (R4: publish/PeerConnection-failure recovery — the Glory case)

| ID | Scenario | Expected | Status |
|----|----------|----------|--------|
| S1 | `escalatePublishFailure()` called while `localPublishState()` is `null` (never published) | Shared throttled full-rejoin executor runs the registered republish handler exactly once; `publishRecoveryFailed` clears once the republish succeeds | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, NEVER-PUBLISHED-ESCALATE) |
| S2 | `escalatePublishFailure()` called while `isLocalPublishHealthy()` is true (`status:'published'`, live pc) | No-op — handler never invoked, never flagged unrecoverable | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, NO-CLOBBER-HEALTHY) |
| S3 | `escalatePublishFailure()` called while `status:'publishing'` (a legit attempt already in flight) | No-op — never interrupts an in-flight attempt | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, NO-CLOBBER-IN-FLIGHT) |
| S4 | Escalation's republish handler throws (rejoin itself fails to re-establish publish) | `publishRecoveryFailed` flips `true` — drives the host-agnostic terminal notice | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, UNRECOVERABLE-ON-FAILURE) |
| S5 | `handleTransportStateChange`'s ICE-transport-recovery-capped branch fires while publish is unhealthy | Previously a dead-end log — now calls `escalatePublishFailure()` (R4 item 2b) | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, CAPPED-WIRES-TO-ESCALATE) |
| S6 | A publish-triggered escalation lands after the shared rung-3 throttle budget (≤1/15s, ≤2/2min) is already consumed by prior subscribe-triggered rejoins | Throttled, not executed as a third rejoin — no storm; still surfaces `publishRecoveryFailed:true`, not a silent latch | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, THROTTLE-SHARED) |
| S7 | `publishInitialSfuWithRetry()`'s retry loop exhausts via a mid-loop state change (runId/state guard trips while the gate is still `'audio-connecting'`, not yet reached either terminal branch) | The `shouldSurfacePublishFailure` state-revert guard in the `finally` block calls `sfuClient.escalatePublishFailure()` — automatic full-rejoin escalation, no manual click required | ✅ wired at that choke point (`room.page.ts`); exercised transitively by S1/S4 via the same executor |
| S7b (iter1) | `publishInitialSfuWithRetry()`'s transceiver-check-failure exit (`hasOutboundAudioTrack()` false after a successful `publish()`) | `markPublishAttemptFailed()` corrects the stale `'published'` state, then `escalatePublishFailure()` fires for real (a naive bare call here is a silent no-op, since `isLocalPublishHealthy()` would otherwise still read `'published'` as healthy) | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, TERMINAL-TRANSCEIVER-FAILURE-ESCALATES) |
| S7c (iter1) | `publishInitialSfuWithRetry()`'s permanent/retry-cap-exhaustion exit | Same `markPublishAttemptFailed()` + `escalatePublishFailure()` sequence (no-op on the state-correction here in the common case, since `doPublish`'s own catch already set `'error'`) | ✅ tsx (`sfu-recovery-coordinator.spec.ts`, TERMINAL-RETRY-CAP-ESCALATES) |
| S8 | A real, successful `sfu.publish()` call (not an escalation) lands while `publishRecoveryFailed` was `true` | Clears to `false` — no stuck-true terminal banner after recovery | ✅ tsx (`sfu-client.spec.ts`, "a real successful publish() clears a prior publishRecoveryFailed") |
| S9 | Existing rung-3/rung-4 subscribe-side behavior (coalescing, throttle, epoch guard, resubscribe-all, per-publisher escalation) | Unchanged — `runFullSfuRejoin()`'s `'published'`-only precondition and its call sites are untouched; only its internals were extracted into a shared executor | ✅ tsx (`sfu-recovery-coordinator.spec.ts` full B2a/B2b suite, still green) |
| S10 | R4c unrecoverable UI, rendered | `.publish-recovery-unrecoverable-notice` with exact text "We couldn't restore your audio automatically. Please rejoin to reconnect." + actionable Rejoin button | ✅ e2e/Playwright screenshot (`batch-B4/screenshots/b4-publish-recovery-unrecoverable-notice.png`), re-verified after iter1 |

**Reuse, not reinvention:** `escalatePublishFailure()` is a new guarded entry point into the SAME
throttled full-rejoin executor rung-3 already uses (extracted, not duplicated) — same coalescing lock,
same ≤1/15s + ≤2/2min throttle, same `resetForTransportRecovery()` + `transportRecoveryHandler` +
`subscribeAllAdvertisedRemotes()` production path. See changes.md.

**Out of scope for B4 (per brief):** B5 (diagnostics page) beyond the pre-existing `publishDiagnosticsDebug()`
event stream (untouched — no new diagnostics fields added). No changes to `publishInitialSfuWithRetry`'s
internal retry/backoff logic itself, or to the `derivePublishGateStatus`/`shouldSurfacePublishFailure`
pure decision functions — B4 only adds ONE new call at their existing terminal choke point.

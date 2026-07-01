# B4 Correction — iter 1 (send-back, converging)

Validator codex55: everything PASSES (clobber-guard, B2a/B2b regression, stuck-banner, publish-storm, capped
branch, R4c UI screenshot real) EXCEPT one R4b gap. Close it and we're done.

## The gap (R4b — auto-recover without manual leave)
`publishInitialSfuWithRetry()` currently calls `escalatePublishFailure()` ONLY inside
`shouldSurfacePublishFailure(...)` (room.page.ts:1865/1875), which is true only while the gate is still
`audio-connecting`. The TWO REAL terminal publish-failure exits skip the automatic escalation entirely:
- transceiver-check failure → sets `audio-failed` and returns (room.page.ts:1802-1812)
- permanent / retry-cap exhaustion → sets `audio-failed` and returns (room.page.ts:1830-1841)
So the Glory case (initial publish never establishes) currently gets only the MANUAL Rejoin button (R4c),
not the automatic publish recovery R4b requires.

## The ask (ONLY this)
At BOTH terminal exits (room.page.ts:1802-1812 and 1830-1841), call `this.sfuClient.escalatePublishFailure()`
BEFORE/alongside setting the audio-failed notice, so the app attempts the automatic full SFU rejoin without a
manual leave. This chains correctly with the existing design: escalatePublishFailure is guarded
(healthy/'publishing' → no-op) and throttled (shared rejoin throttle), and sets publishRecoveryFailed =
!isLocalPublishHealthy() on completion — so if the auto-rejoin succeeds the notice never shows, and if it
fails the R4c notice + Rejoin button remain. Do not change the guard/throttle/notice logic (all accepted).
Add/extend a fake-timed test asserting a terminal initial-publish failure now triggers escalatePublishFailure
(auto-recovery), not just the manual notice. Wrap test runs in `timeout 25`. Re-emit DONE when build +
targeted tests (incl. B2a/B2b/B3 regression) green.

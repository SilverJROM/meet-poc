## Accepted: B1(R1), B2a+B2b(R2), B3(R3) — all VERIFIED. Commits: 6643a02, e33a98d, 5f4a6bf, fc05c58.
Branch: fix/sfu-selfheal-20260701.
Recovery coordinator (subscribe ladder rung-1→2→rejoin, never-give-up) + stalled-audio escalation + epoch guard
+ full SFU rejoin (rung-3) + rung-4 UI are all shipped and validated.
Open: R4(B4), R5(B5), R6(B6-B9).
Key APIs: scheduleRecoveryEscalation(id,hasFirstFrame) · escalateStalledRemoteAudio(id) · handleNeedsRejoinTrigger/runFullSfuRejoin (rung-3) · canRunSubscribeRecovery() gate · lastRecoveryEvent/sfuRejoinThrottled signals · resetForTransportRecovery bumps recoveryEpoch.
Gotchas: frontend specs via `npx tsx` WRAP IN `timeout 25`; recovery tests → fake-timed sfu-recovery-coordinator.spec.ts.
Pre-existing out-of-scope failure: room-decisions.spec L434 missingPreflightPrereqs (logged plan/WK_0701/list/).

## Ready for Batch-B4 (publish/PC-failure recovery, R4) — [REDTEAM:standard], complexity high
The Glory case (call 2): an admitted client with hasPc:false / publishStatus null|error after joining —
media never published, so peers see them advertised-not-subscribed AND they hear no one.
Consensus: reuse existing infra. Relevant existing code:
- handleTransportStateChange 'capped' (~sfu-client.service.ts L805, planSfuTransportRecovery / SFU_TRANSPORT_RECOVERY_CAP)
  — B2b red-team confirmed this is R4/B4 territory (publish/PC), currently "defers to publish recovery path". B4 owns it.
- rejoinAfterInitialPublishFailure() + publishInitialSfuWithRetry() + initialPublishFailureNotice in room.page.ts.
- localPublishState signal (status: 'publishing'|'published'|'error'), isLocalPublishHealthy().
Acceptance (R4): (a) identify media-not-published state (hasPc:false / publish null|error post-join);
(b) retry publish or rejoin SFU WITHOUT the user manually leaving; (c) if unrecoverable, UI states exactly
what failed. Reuse rung-3 rejoin path where sensible; don't clobber a healthy publish. Routing: Sonnet.

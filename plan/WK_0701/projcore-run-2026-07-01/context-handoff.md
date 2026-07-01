## Accepted: Batch-B2b — STATUS: PASS (commit 5f4a6bf) — R2 VERIFIED
Branch: fix/sfu-selfheal-20260701
Implemented: rung-3 full SFU rejoin (coalesced, throttled ≤1/15s ≤2/2min) reusing resetForTransportRecovery()
+ transportRecoveryHandler + new subscribeAllAdvertisedRemotes(epoch); rung-4 visible banner + Retry +
recoveryLadder diagnostics. Elite red-team: 5 regression classes all SAFE.
Req#s: R1 VERIFIED, R2 VERIFIED. Open: R3(B3), R4(B4), R5(B5), R6(B6-B9).
Key APIs now available for B3/B4:
- Recovery coordinator: scheduleRecoveryEscalation(publisherClientId, hasFirstFrame); emits needs-rejoin →
  handleNeedsRejoinTrigger → runFullSfuRejoin (rung-3). canRunSubscribeRecovery() is the gate.
- lastRecoveryEvent signal (rung + publisher + epoch). sfuRejoinThrottled signal (rung-4).
- Epoch guard: resetForTransportRecovery bumps recoveryEpoch; doSubscribeTracks checks shouldBindSubscribeResponse.
Gotchas: frontend specs via `npx tsx` — WRAP IN `timeout 25` (real 30s/60s recovery timers hang). New recovery
tests go in the fake-timed sfu-recovery-coordinator.spec.ts (injectable nowMs() for the 15s/2min throttle).

## Ready for Batch-B3 (stalled remote-audio detection) — [REDTEAM:standard]
Consensus §Stalled Remote Audio: reuse the B2a coordinator, NOT a separate resubscribe loop. Rules:
- peer.micEnabled === false → healthy silence, clear/hold (reuse prior-art publisherMicEnabled guard).
- emitted samples / voice energy advanced → clear voice-stall attempts.
- bytes arrive but emitted/energy do NOT advance → playout recovery first (resume/kickstart/replay/rebuild via
  RemoteAudioService), then escalate into scheduleRecoveryEscalation() if still stalled.
- no inbound bytes for advertised audio after grace while mic on/unknown → subscribed-no-RTP failure → coordinator.
- after per-publisher recovery succeeds → reset that publisher's voice watchdog attempts.
Existing: decideRemoteVoiceWatchdogAction in room-decisions.ts (currently caps → mark-stalled — replace the
mark-stalled terminal with escalation into the coordinator). observeRemoteVoiceTrack in room.page.ts wires it.
Per-publisher, must NOT clobber unrelated healthy streams. Routing: Sonnet.

# opus RED-TEAM CR4 (convergence)

## R9 now correct
updateRemoteAudioHealth (room.page.ts ~2966) iterates this.peers() (admitted roster, skips local), tracks peerFirstSeen per peer, computes pastGrace=(now-firstSeen)>=7s, isPublishing=publishers.has(clientId), hasTrack=inboundByClientId.has, micEnabled=peer.micEnabled. classifyPeerAudioHealth priority: muted->ok, within-grace->ok, admitted+past-grace+!publishing->'never-published'(badge), !hasTrack->no-track, stalled->stalled.
- Joanne (admitted, never published, past 7s, unmuted) -> 'never-published' -> BADGE. COVERED (the gap is closed).
- Muted peer -> 'ok' (no cry-wolf). Just-joined (<7s) -> 'ok' (no flicker). 
- No leak: peerFirstSeen pruned of departed peers (2989) + cleared in cleanupCall (2693).

## Whole-gate sweep
- Guest journey: green-room mic (positive micWorking signal) + speaker (Yes/No confirm) gate Join; admit -> publishInitialSfuWithRetry sets audio-connecting; success+bytes-sent -> ready; ANY failure/state-revert/timeout(15s) -> audio-failed (shouldSurfacePublishFailure finally-guard); empty-transceiver -> throws. No silent never-publish.
- Quiet-guest vs host-aware: guest connection-fail -> notice+dialog suppressed (gated isHost) BUT host gets the 'never-published'/'no-track'/'stalled' badge + diagnostics. No failure is silent to BOTH.
- Persistence R8: fallbackChosenIdForAudioSync preserves the selection (confirmed CR2). Recorder/video untouched.

## Findings
- No [CRITICAL] found. Gate coherent; R9 covers the primary failure + no false-alarms; never-publish closed; quiet-guests still host-visible.
- [NON-CRITICAL] none material this pass.

STATUS: CRITICAL-CLEAN — all CR1-CR3 fixes hold, R9 now provably badges the never-published (Joanne) case without false-positives, whole-gate sweep finds no remaining CRITICAL.

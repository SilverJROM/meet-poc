# opus CODE red-team CR7 (lens L7: state-machine + lifecycle)
(Humility note: I under-called CR5/CR6; flagging edges honestly here.)

## State-machine
Largely consistent. `remoteAudioBlockedReason` priority: sink-failed (timeout/failed) > playback-unsupported > voice-stalled > paused(!playbackFailure) > autoplay(blocked) > null. remoteAudioBlocked = registry-nonempty && some(blocked||voiceStalled||(paused && !playbackFailure)). These align (playbackFailure entries deliberately excluded from the "tap to enable" banner per CR-fix-4).
- **MINOR edge:** an entry with `playbackFailure === 'aborted'` (AbortError) that is also `paused` and not `blocked`/`voiceStalled` → blockedReason returns null (line `paused && !playbackFailure` is false because playbackFailure truthy; falls through to null). So an aborted+paused entry reports blockedReason=null and is NOT counted blocked. AbortError is transient (play interrupted by a srcObject swap) and self-heals on the next syncPeers/recovery, so this is arguably correct, but it's an asymmetry worth a glance: 'aborted' has no dedicated blockedReason and is invisible if it ever persists. Low severity.
- No contradictory or hard-STUCK combination found: voiceStalled clears on every watchdog non-stall path (CR-fix-2); blocked clears on onPlaying; sink states recompute on applyOutputDevice/addPublisher.

## Reset hygiene
`reset()` (remote-audio.service.ts) clears: inCall, generation++, clearRegistry, unlocked, selectedSinkId, effectiveSinkId, usedDefaultSinkFallback, mutedAll, contextState, outputPlaying, remoteAudioBlocked, voiceRecoveryCounters. The CR2 'unlocked' leak class is CLOSED including its siblings (selectedSinkId/effectiveSinkId/usedDefaultSinkFallback). SFU side: subscribeMidConflictWarnings cleared on teardown (CR-fix-3). Room side: per the code comments, selectedSpeakerUnavailable + micSilenceWindow + remoteVoiceWatchdogPeers reset in cleanupCall() (watchdog maps verified cleared in CR4).
- To confirm (panel): that cleanupCall() actually resets selectedSpeakerUnavailable and any per-entry sinkApply/voiceStalled state is moot since the registry is cleared (entries destroyed). Service-level fields all reset above.

## NEW bugs
None blocking from my audit. One MINOR note: 'aborted' playbackFailure has no dedicated blockedReason (returns null) — acceptable since transient/self-healing, but a dedicated reason would improve observability symmetry.

STATUS: CLEAN — reset hygiene complete (CR2 class + siblings closed), state machine consistent with one minor transient-aborted observability asymmetry (not a stuck/lying state). Vote toward streak 1/3 (lens L7). Panel: please confirm cleanupCall resets selectedSpeakerUnavailable.

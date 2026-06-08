# opus CODE red-team CR8 (lens L8: adjacent-feature regression)

## Per-feature regression check
- **Recorder/recording: NOT REGRESSED.** The recorder sources remote audio DIRECTLY from `this.peers()` / `this.remoteStreams()` (room.page.ts:700 syncRecorderPeerStreams; 1318 recorder.start(localStream, this.remoteStreams())) into its OWN AudioContext + per-peer createMediaStreamSource (recorder.service.ts:113-136). It NEVER sourced from the removed remote-audio mixer. `git diff` touched ZERO recorder lines. So removing the mixer / per-publisher registry change does not affect what the recorder captures. ✓
- **Transcripts / speaker frames:** no dependency on the removed mixer/outputPlaying/remoteAudioMixer audible path; transcripts run off their own pipeline. No regression found.
- **Screen-share:** the registry handles AUDIO only; remoteScreenStreams (video) are handled separately in sfu-client; screen tiles render via the video element (the REMOVED element was the tile AUDIO element). Subscribe rollback is now touched-only (preserves concurrent + screen streams). No regression.
- **Lobby self-test / mic preview / INPUT device selection:** input (mic/cam) acquisition + lobby self-test are separate from remote-audio playout; applySpeakerDevice routes OUTPUT to the registry but input paths are untouched. active-speaker is a UI-only silent analyser (unchanged). No regression.
- **Watchdog / keepalive / interaction-recovery:** rewired to registry replay; fire on the in-call/state effects; timers cleared on leave (verified CR4 leak audit). No double-fire/leak found.

## CR7 consistency re-verify
HOLDS: remoteAudioBlocked = entries.some(remoteAudioBlockingReason(e)!==null) (632) → aggregate derived from the SAME function as blockedReason → cannot disagree. sink-failed only on failed/timedOut (649), not default-fallback-playing. clear-on-success + isEntryCurrent post-await guard in applyOutputDevice. selectedSpeakerUnavailable reset at preflight. No residual stuck/lying state.

## NEW bugs
None found. tsc=0, specs pass, ng build green.

STATUS: CLEAN — no adjacent-feature regression (recorder independent + untouched; transcripts/screen-share/lobby/input/active-speaker intact); CR7 unified blocked-derivation holds. Vote toward streak 1/3 (lens L8).

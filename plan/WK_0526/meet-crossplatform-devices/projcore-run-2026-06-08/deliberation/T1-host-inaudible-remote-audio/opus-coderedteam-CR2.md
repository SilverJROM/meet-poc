# opus CODE red-team CR2

## CR-fix-1 verification
- **P0 voiceStalled latch: CORRECT.** recoverVoicePlayout sets voiceStalled=true (remote-audio.service.ts:256) when the watchdog reaches bytes-climbing/emitted-flat; cleared ONLY by noteVoiceEmissionAdvanced (262) which the watchdog calls when remoteVoiceEmittedClimbed (room.page.ts:2747-2748). refreshBlockedState includes voiceStalled (507). Test asserts banner true despite unpaused element + clears on emitted advance. Matches the spec exactly.
- **Rollback streams: OK** — snapshot/restore of remoteStreams/remoteScreenStreams in the rollback closure; sfu-client.spec ghost-stream test passes.
- **Per-publisher energy: OK** — mediaPlayout now call-wide; per-publisher inbound totalAudioEnergy added.
- **reset() hygiene: OK** — clears unlocked + selectedSinkId.

## NEW bugs found
None that block. Detailed false-positive analysis below; one acceptable transient noted.

## False-positive banner risk (silent participant): SAFE
Walked observeRemoteVoiceTrack (room.page.ts:2733-2772) + the helpers (3877-3895):
- A legitimately SILENT remote with DTX on → few/no packets → `remoteVoiceBytesClimbed` FALSE (bytes flat across window) → early return at 2753, NO stall. SAFE.
- A SILENT remote with DTX off (continuous silence/CNG frames) → the jitter buffer emits silence frames → `remoteVoiceEmittedClimbed` TRUE → noteVoiceEmissionAdvanced clears at 2747-2748. NO false banner. SAFE.
- The latch trips ONLY on bytes-climbing (audio packets ARE arriving) AND emitted-flat (jitter buffer not emitting) — a genuine playout stall. Correct.
- Minor (acceptable, not a bug): a one-sample network hiccup where bytes tick up but emitted is momentarily flat could briefly set the banner, self-clearing on the next sample when emitted advances. Advisory banner + recovery attempt; harmless transient. decideVoiceRecovery's attempt window + the emitted-climbed fast-clear bound it.

## Other checks
- syncPeers track-replace/dedup/late-joiner unchanged + still correct. No new dead code (tsc/build green prove no dangling ref; mixer-era audible machinery removed; `outputPlaying` repurposed to registry-playing, now live not dead).
- No NEW silent-no-banner path: a stalled publisher now latches the banner (the CR1 P0 hole is closed); a paused element sets blocked; addPublisher catch sets blocked.

STATUS: CLEAN — CR-fix-1's fixes are correct; the voiceStalled latch is safe against silent-participant false-positives (only true bytes-up/emitted-flat trips it, cleared on emission advance); no new bug found in the current code.

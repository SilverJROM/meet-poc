# Haiku CODE red-team CR3

## CR-fix-2 verify: latch-nonsticky / rollback-touched-only / energy-join — OK or gap

**voiceStalled latch (non-sticky verification):**
- Latch initialized false (remote-audio.service.ts:435)
- Set to true in recoverVoicePlayout() (line 287) on recovery attempt
- Cleared via setVoiceStalled(id, false) in:
  - noteVoiceEmissionAdvanced() when emitted climbs (room.page.ts:754) ✓
  - clearVoiceStalls() on 5 mandatory paths:
    1. mutedAll (line 2709) ✓
    2. peer-removed from activePeerIds (line 2723) ✓
    3. no-sample collected (line 2741) ✓
    4. bytes-flat after window-fill (line 2760) ✓
    5. no-voice-energy after window-fill (line 2773) ✓
- Energy gate (sampleWindowHasVoiceEnergy):
  - Checks highest audioLevel > 0.0005 (line 104) ✓
  - Checks totalAudioEnergy delta > 0.000001 (line 106) ✓
  - Requires 2+ finite energy samples for delta check (line 105) ✓
  - Window is VOICE_RECOVERY_SAMPLE_WINDOW=4 (line 63), not single-point ✓
  - Thresholds are conservative (0.0005 audioLevel, 1μ energy delta) ✓
- Latch cannot stick: recovery attempts hit 4-attempt cap; once window fills without energy, latch clears on next cycle ✓

**Touched-only subscribe rollback:**
- Snapshots taken BEFORE subscribe: subscribedBefore, publisherRemoteStreamBefore, publisherRemoteScreenStreamBefore, publisherTrackNamesBefore (sfu-client.service.ts:1716-1719) ✓
- touchedMidEntries tracks ONLY mids modified in THIS subscribe call (line 1721, rememberTouchedMid at 1729-1735) ✓
- Rollback restores ONLY touched mids + streams + track names (line 1766-1802) ✓
- Concurrent publisher's tracks preserved: snapshot is per-publisher (clientId), restore scoped to failing publisher (line 1788-1790) ✓

**trackName join in diagnostics:**
- buildRemoteAudioPlayoutRows() joins by publisher + trackName (diagnostics.page.ts:121-125) ✓
- Falls back to publisher-only match if trackName not found (line 126) ✓
- Reads audioLevel + totalAudioEnergy from matched inbound track (line 137-138) ✓
- Gracefully handles null trackName: trackName-join attempt skipped, fallback used (line 124 `!!publisher.trackName`) ✓

**Core path regressions:**
- addPublisher sink-before-play: applySinkId() called BEFORE play() (remote-audio.service.ts:440, then 453) ✓
- syncPeers diff/dedup/track-replace: detects stream/track change, removes old, adds new (line 257-261) ✓
- voiceStalled integration: latch gates allSinksPlaying() and refreshBlockedState() (line 309, 542) ✓
- Mid binding conflict detection: throws if reusing mid for different live publisher (sfu-client.service.ts:1743-1755) ✓

## NEW bugs (table severity|file:line|what|fix) or "none"

none

STATUS: CLEAN — no real bug in current code


# CR-FIX-2 — Fix the CODE red-team CR2 findings (voiceStalled stuck/false-pos, rollback clobber, energy join)

You are the IMPLEMENTER (codex). Verifier != fixer. The 6-model CR2 red-team found these in YOUR CR-fix-1 changes. Fix ALL.
## FIRST tool call = callback: printf '[projcore callback] CR-FIX-2 STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <abs>/callbacks.md ; plan → wait APPROVED-PLAN → implement → DONE.

## BUGS
1. **P0 — `voiceStalled` STUCK + FALSE-POSITIVE** (room.page.ts:2719-2772, remote-audio.service.ts:254-263,505-519).
   - STUCK: once `voiceStalled=true`, the watchdog exit paths that ABANDON/RESET a peer do NOT clear it: `!sample` (2735), `!remoteVoiceBytesClimbed` bytes-flat (2753), peer removed from inbound/activePeerIds, and mutedAll. → banner pinned forever after a stall followed by silence/stat-loss.
   - FALSE-POSITIVE: the trigger is raw `bytesReceived` rising + `jitterBufferEmittedCount` flat — a legitimately SILENT remote still sending RTP/CN/keepalive bytes can trip it.
   - FIX (do BOTH):
     (a) Clear `voiceStalled` for a peer on EVERY watchdog path that stops classifying it as actively-stalled: no-sample, bytes-flat, peer-no-longer-observed, and when `mutedAll` is true. (Call a clear/noteVoiceEmissionAdvanced-equivalent on those paths.) The latch must be NON-STICKY — it persists ONLY while a fresh bytes-up/emitted-flat verdict keeps recurring.
     (b) Gate the stall TRIGGER on evidence of REAL remote audio: only enter recovery/stall if recent inbound `audioLevel`/`totalAudioEnergy` (now captured in SfuInboundTrackStats) indicates above-silence input. If energy/level is ~0 (silent/CN), treat as "silent, not stalled" → reset samples, NO banner.
   - TEST: (i) stall verdict → banner; then bytes go flat → banner CLEARS (not stuck). (ii) silent remote (bytes climb, audioLevel~0, emitted flat) → NO banner. (iii) mutedAll → no stall banner.
2. **HIGH — subscribe rollback clobbers concurrent streams** (sfu-client.service.ts:1692-1751, 823-847). `rollbackSubscribeMutation` restores the WHOLE remoteStreams/remoteScreenStreams snapshot, erasing a DIFFERENT publisher's `ontrack` stream that arrived after the snapshot. FIX: roll back ONLY the publisher/tracks touched by THIS failing subscribe (remove just the tracks/streams this op added for `publisher.clientId`), or merge the snapshot with current maps — do NOT wholesale-overwrite unrelated post-snapshot ontrack arrivals. TEST: failed reneg for publisher B does not remove publisher A's stream that arrived mid-op.
3. **MED — per-publisher energy join by wrong identity** (diagnostics.page.ts:105-129). Inbound stats are keyed by SFU `trackName`; playout rows use browser `MediaStreamTrack.id` as `trackId` → join rarely matches → wrong-talker energy. FIX: carry the subscribed SFU `trackName` through the remote-audio registry/playoutDiagnostics payload and join inbound energy by publisher+trackName (not browser track.id).
4. **MINOR** — remove the dead redundant `clearSources()` after `clearRegistry()` (remote-audio.service.ts:350-351).

## Constraints: frontend only; don't touch recorder; tsc --noEmit=0 (RUN IT YOURSELF — last time tsx passed but tsc failed); run touched specs via npx tsx; ng build green; append CR-FIX-2 to changes.md; NO commit.
Reply STATUS: PROPOSED + how you'll make the latch NON-STICKY + energy-gated, the touched-only rollback, and the trackName-join. Wait for APPROVED-PLAN.

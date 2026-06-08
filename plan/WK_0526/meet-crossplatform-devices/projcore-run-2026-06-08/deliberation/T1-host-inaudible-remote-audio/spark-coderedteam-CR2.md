# spark CODE red-team CR2
## CR-fix-1 verification: P0-latch / rollback / per-pub-energy / reset — each OK or gap
- **P0 voiceStalled latch**: implemented as per-publisher sticky state in `RemoteAudioService` and driven by room watchdog.
  - `recoverVoicePlayout()` sets `voiceStalled` true for a publisher before per-entry replay: [remote-audio.service.ts:254-258](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:254)
  - `noteVoiceEmissionAdvanced()` clears it on emitted-count climb: [room.page.ts:2747-2750](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2747), [remote-audio.service.ts:261-263](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:261)
  - Banner uses `entry.blocked || entry.voiceStalled || entry.el.paused`, so latch contributes to `remoteAudioBlocked`: [remote-audio.service.ts:269-271](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:269), [room.page.ts:637-643](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:637)
  - Conclusion: behavior matches intent; no obvious stale-stuck for normal case where `bytesReceived` and `jitterBufferEmittedCount` both stay still (no recovery actions are attempted).

- **Rollback stream snapshot/restore**: `subscribedTracks`, `remoteStreams`, and `remoteScreenStreams` are snapshotted and restored on failure in `doSubscribeTracks()`:
  - snapshot at start: [sfu-client.service.ts:1692-1702](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1692)
  - restore on error: [sfu-client.service.ts:1741-1751](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1741)
  - Conclusion: CR mechanism is in place.

- **Per-publisher energy in diagnostics**: inbound inbound stats now carry `totalAudioEnergy`, and `media-playout` is exported at call-level:
  - `SfuInboundTrackStats.totalAudioEnergy`: [meeting-sessions.service.ts:296-300](/home/agjrom/websites/meet-poc/frontend/src/app/services/meeting-sessions.service.ts:296)
  - `media-playout` extraction in collectDiagnostics: [sfu-client.service.ts:758-771](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:758)
  - remote audio playout diagnostics now built from registry and rendered with matched inbound energy: [remote-audio.service.ts:318-337](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:318), [diagnostics.page.ts:105-129](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.ts:105)
  - Conclusion: implemented and wired end-to-end.

- **reset hygiene / dead/ stale state**: `reset()` clears `unlocked`, `selectedSinkId`, and resets state.
  - [remote-audio.service.ts:347-361](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:347)
  - Also includes `remoteAudioBlocked`/`outputPlaying` reset: same block.
  - One small concern remains: `clearSources()` after `clearRegistry()` is redundant (`clearSources` becomes no-op because `clearRegistry` already emptied the map).

## NEW bugs found (severity|file:line|what|fix)
| severity | file:line | what | fix |
|---|---|---|---|
| medium | [sfu-client.service.ts:1692-1751](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1692) | In `doSubscribeTracks` rollback restores `remoteStreams`/`remoteScreenStreams` from snapshots without checking current live publisher membership. If a peer is removed (or roster churn happens) while subscribe is in-flight and request later fails, rollback can reintroduce stale entries for departed peers and temporarily restore removed streams to `remoteStreams`/`remoteScreenStreams` before next peers-derived sync. | Re-snapshot/restore these maps under current membership filter (e.g. intersect with `remotePublishers()` or `subscribedClientIds`) or skip map restores when publisher set changed during in-flight subscribe.

## False-positive banner risk (silent participant): real or safe? (file:line)
- **Assessment: mostly safe, with a narrow edge-case caveat**.
  - `observeRemoteVoiceTrack` triggers recovery only when emitted sample does not climb *and* bytes climb for window (`state.samples.length >=4 && !remoteVoiceBytesClimbed()` short-circuits, and recovery path requires `decideVoiceRecovery`): [room.page.ts:2753-2763](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2753)
  - Stale `voiceStalled` clears only on emitted climb: [room.page.ts:2747-2750](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2747)
  - If a legitimately silent publisher stops all RTP progress, emitted/bytes do not climb and watchdog does not latch, so banner does not pin.
  - Edge case: if bytes climb while emittedCount stalls (e.g., malformed/late-decoding stream), latch can persist until emitted advances.

STATUS: BUGS — medium

# Spark Code-Red Team Review — CR3

## CR-fix-2 verify (latch now non-stick + energy-gated; touched-only rollback; trackName join)

### 1) voiceStalled latch is non-stick and energy-gated
- `RemoteAudioService.decideVoiceRecovery` now gates stall-clearing on `sampleWindowHasVoiceEnergy`, combining:
  - `audioLevel` threshold (0.0005)
  - `totalAudioEnergy` movement threshold (0.000001)
- `sampleWindowHasVoiceEnergy` was implemented in `frontend/src/app/services/remote-audio.service.ts` and is used by the recovery path for non-sticky stall behavior.

### 2) Stalls are cleared through touched-only state paths
- `remote-audio.service.ts` keeps stall state per publisher; `clearVoiceStalls` supports scoped clearing (`clearVoiceStalls([peerId])`).
- `room.page.ts` clears stalls for the peer in all relevant watchdog branches (`remoteVoiceSample` missing/empty, no energy/no progress, peer removal, and `mutedAll`).
- This makes stall rollback scoped instead of broad/global where applicable.

### 3) touched-only rollback in subscribe path
- In `sfu-client.service.ts`, `doSubscribeTracks` snapshots state and rolls back only touched entries using `touchedMidEntries`.
- State restored for failing peer includes:
  - `subscribedTracks`, `remoteStreams`, `remoteScreenStreams`, `remoteTrackNames`, and retry metadata.
- Un-touched peers retain state.
- Existing sfu spec validates concurrent peer isolation (`SFU-S1` style assertions).

### 4) trackName join in diagnostics
- `meeting-sessions.service.ts` and `sfu-client.service.ts` include `trackName`/`totalAudioEnergy`/media playout fields.
- `diagnostics.page.ts` now joins remote playout rows by `trackName` against inbound track stats and includes a fallback to first audio track for publisher.
- Added redaction behavior for the selected audio sink while preserving privacy.

## NEW bugs
None found.

## Closing
`CR-fix-2` is implemented as specified in the current code and patch set. I did not identify a confirmed new behavior regression tied to these changes.

STATUS: CLEAN

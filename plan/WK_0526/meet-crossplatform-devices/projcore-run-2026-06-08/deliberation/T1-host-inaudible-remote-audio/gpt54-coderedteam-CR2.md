# gpt54 CODE red-team CR2

## CR-fix-1 verification: P0-latch / rollback / per-pub-energy / reset

- `P0 voiceStalled latch`: partially fixed. The original CR1 hole is closed: watchdog remediation now latches blocked state through `recoverVoicePlayout() -> setVoiceStalled(true)` and the room banner mirrors `remoteAudio.remoteAudioBlocked()` (`frontend/src/app/services/remote-audio.service.ts:254-263`, `frontend/src/app/services/remote-audio.service.ts:505-519`, `frontend/src/app/pages/room/room.page.ts:633-643`). A replay that resolves while playout is still dead no longer hides the banner.
- `Rollback snapshot/restore`: not clean. Snapshotting `remoteStreams` / `remoteScreenStreams` fixed the old ghost-stream leak for the failing subscribe itself, but the restore is still whole-map overwrite and can delete newer legit `ontrack` arrivals that landed after the snapshot (`frontend/src/app/services/sfu-client.service.ts:1692-1751`, `frontend/src/app/services/sfu-client.service.ts:823-847`).
- `Per-publisher energy`: not clean. `collectDiagnostics()` now carries inbound `totalAudioEnergy` per inbound RTP stat, so the raw data exists (`frontend/src/app/services/sfu-client.service.ts:734-751`). But diagnostics joins that stat to playout rows by comparing `publisher.trackId` to `inbound.trackName`, which are different identities in this codebase, so the row is not reliably per-track (`frontend/src/app/pages/diagnostics/diagnostics.page.ts:105-129`, `frontend/src/app/services/sfu-client.service.ts:21-24`, `frontend/src/app/services/remote-audio.service.ts:324-329`).
- `reset() hygiene`: the important fix is present. `reset()` clears sticky unlock and selected sink (`frontend/src/app/services/remote-audio.service.ts:347-355`). Minor leftover: `clearSources()` immediately after `clearRegistry()` is dead redundant code (`frontend/src/app/services/remote-audio.service.ts:350-351`).

## NEW bugs found

| severity | file:line | what | fix |
|---|---|---|---|
| high | `frontend/src/app/pages/room/room.page.ts:2733-2737`, `frontend/src/app/pages/room/room.page.ts:2719-2721`, `frontend/src/app/services/remote-audio.service.ts:254-263`, `frontend/src/app/services/remote-audio.service.ts:515-519` | `voiceStalled` can get stuck true forever if telemetry disappears before `jitterBufferEmittedCount` advances. The latch is only cleared by `noteVoiceEmissionAdvanced()`. But the watchdog drops peer state on `!sample` and on peer disappearance from `inboundAudio` without clearing the latch. Result: one stalled verdict can leave `remoteAudioBlocked` pinned until the publisher is removed/re-added, even if the remote is now muted, stats are temporarily absent, or the browser stops exposing `jitterBufferEmittedCount`. | On every watchdog exit path that abandons tracking for a peer (`!sample`, peer removed from `activePeerIds`, track no longer observed), explicitly clear `voiceStalled` for that peer or replace the boolean latch with a timestamped state that expires unless fresh stalled evidence continues. |
| high | `frontend/src/app/services/sfu-client.service.ts:1692-1751`, `frontend/src/app/services/sfu-client.service.ts:823-847` | Subscribe rollback still clobbers legitimate concurrent streams. `processOntrack()` mutates `remoteStreams` / `remoteScreenStreams` live and independently. `rollbackSubscribeMutation()` restores full cloned snapshots from before the failing subscribe. If another publisher's `ontrack` fires after the snapshot but before rollback, that good stream is erased. This is exactly the “removes a legit concurrent publisher's stream” failure the packet asked about. | Roll back only the publisher/tracks touched by the failing subscribe, or merge the snapshot restore with current maps instead of wholesale replacement. Do not overwrite unrelated post-snapshot `ontrack` arrivals. |
| medium | `frontend/src/app/pages/diagnostics/diagnostics.page.ts:105-129`, `frontend/src/app/services/remote-audio.service.ts:324-329`, `frontend/src/app/services/sfu-client.service.ts:21-24` | The new per-publisher energy display is not actually per-track. Playout rows expose browser `MediaStreamTrack.id` as `trackId`, but inbound stats are keyed by SFU `trackName`. The first `find()` therefore almost never matches, and the code silently falls back to “first audio track for that publisher”. With multiple audio stats for one publisher, diagnostics can attribute the wrong `totalAudioEnergy` to the row. | Carry the subscribed SFU `trackName` through the remote-audio registry/diagnostics payload, or join inbound stats by publisher + subscribed track metadata rather than browser `track.id`. |

## False-positive banner risk (silent participant): real or safe?

Not safe.

The latch logic still has no silence/activity guard. The watchdog escalates on:

- `VOICE_RECOVERY_MIN_BYTES_DELTA = 0` (`frontend/src/app/services/remote-audio.service.ts:60-63`)
- `remoteVoiceBytesClimbed()` = any `last.bytes > first.bytes` over the sample window (`frontend/src/app/pages/room/room.page.ts:3891-3893`)
- no check of `audioLevel` or `totalAudioEnergy` before calling `recoverVoicePlayout()` (`frontend/src/app/pages/room/room.page.ts:2758-2771`)

So if a non-speaking publisher still produces a trickle of received bytes without emitted-sample growth, the code will mark `voiceStalled=true` and raise the call-wide banner even though the participant may simply be silent. Because the clear path is only emitted-count advance, that false banner can then sit there until the remote speaks again or the publisher is torn down. The original “silent-no-banner” hole is fixed, but the latch is still too binary and too dependent on perfect emitted-count telemetry.

STATUS: BUGS — `voiceStalled` can stick forever on missing stats, and subscribe rollback can still delete a legitimate concurrent remote stream

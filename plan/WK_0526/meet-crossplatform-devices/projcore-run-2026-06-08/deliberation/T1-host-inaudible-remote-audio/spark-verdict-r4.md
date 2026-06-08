# spark verdict — T1 round 4

## Q1 — Architecture: Option A confirmed? (or named alternative + why)

**NOT FIXED IN CODE: Option A is still not implemented.**

The live code remains mixer-first on every critical path: `RemoteAudioService.mixerEnabled()` is hardcoded `true` (`frontend/src/app/services/remote-audio.service.ts:191-193`), `remoteAudioMixerEnabled` is hardcoded `true` (`frontend/src/app/pages/room/room.page.ts:222`), and per-element tile audio is disabled in that mode (`frontend/src/app/pages/room/room.page.html:14-16`, `229-231`).

So the proposed fixed design (direct per-publisher `<audio srcObject=stream>`) is conceptually still the right direction for A4/A3, but the implementation did not switch from mixer to that design. **Q1 result: REVISE because no architectural cutover occurred.**

## Q2 — B1-B10 verification table

| Blocker | Status | Evidence in code | Why this is wrong / required fix |
|---|---|---|---|
| B1 volume + mute-all no-op on per-element path | FIX-NEEDED | `setMutedAll`/`setVolume` only drive `this.gain` (`frontend/src/app/services/remote-audio.service.ts:195-205`); tile audio path has no mute/volume updates (`frontend/src/app/components/tile/tile.component.ts:57-66`). | If Option A is enabled, per-peer elements will stay at browser default volume/mute because service does not write `el.volume`/`el.muted`. |
| B2 feedback limiter behavior | FIX-NEEDED | Feedback limiter is still hard-wired to mixer graph (`remote-audio.service.ts:56-58`, `518-533`) with no migration notes in current change-set. | Option A either must accept intentional limiter removal with explicit rationale (code comment/docs) or provide an equivalent per-path control. Currently no updated migration of this decision. |
| B3 130% gain cap loss / slider floor | FIX-NEEDED | Volume clamp still permits 1.3 (`remote-audio.service.ts:50`, `201-205`) and UI label still exposes amp range (`controls-bar.component.ts:70-73`). | Option A requires volume flooring logic in controls/UI to 100% (or explicit residual gain behavior) because direct `<audio>.volume` has no >1 range. |
| B4 share-layout double audio | FIX-NEEDED | Share layout still conditionally renders audio for both share-main and strip peers when mixer is disabled (`room.page.html:249-275`) but no dedup guard exists. | No one-publisher-id dedupe keyed by `publisherClientId`; audio duplication will reappear as soon as both containers are active after mixer migration. |
| B5 mid-guard reclaim safety | FIX-NEEDED | In the no-renegotiation branch, each subscribed track is blindly written to `midToEntry` (`sfu-client.service.ts:1751-1755`) with only rollback-by-key snapshots, no explicit stale-owner check/reclaim-safe path. | Cross-publisher mid reuse can still displace a live owner without explicit reclaim semantics; this is the one-publisher/track safety risk. |
| B6 watchdog `recoverVoicePlayout` on mixer-disabled | FIX-NEEDED | Immediate return when mixer disabled (`remote-audio.service.ts:351-353`). | Per-element autoplay recovery path is missing; voice watchdog cannot remediate stalled individual `<audio data-remote-audio>` sinks. |
| B7 recoverPlayback no-op for mixer-disabled | FIX-NEEDED | `recoverPlayback` returns early via `allSinksPlaying()` when mixer disabled (`remote-audio.service.ts:328-329`). | Keep-alive/visibility recovery never replays per-element sinks if path is direct `<audio>` mode. |
| B8 banner coupling (`hasSources`/`outputPlaying`) | FIX-NEEDED | Banner effect is gated by mixer flags and uses `contextState + outputPlaying` (`room.page.ts:650-659`) plus has-sources check (`room.page.ts:653-655`). | In per-element mode, this no longer reflects real playback state; it must be keyed from per-element pause/play states directly. |
| B9 sink apply on tile mount/race | FIX-NEEDED | `applySpeakerDevice` is global + debug; no tile-level sink hook that targets mounted `audio[data-remote-audio]` elements (`room.page.ts:2657-2658`, no callsite in tile). | A newly mounted tile can miss selected sink on first mount/layout churn unless apply is done during tile effect/mount. |
| B10 keep service, retire graph path only | FIX-NEEDED | Service still builds/owns full mixer graph by default: `mixerEnabled()` true and full `AudioContext` lifecycle (`remote-audio.service.ts:191-193`, `508-536`, `560-565`, `594-603`). | Option A requires service to remain for state/watchdog while retiring mixer graph from audible path; current implementation still routes all audible via it. |

## Q3 — End-to-end trace through revised design and first break

Trace target: host joins -> host publishes -> A joins -> both A and B publish concurrently -> output-device switch -> volume/mute -> A starts share -> B leaves/rejoins -> tab/background restore -> talking resumes.

1. Join path starts and gesture unlock is wired (`unlockAudioFromGesture` + `remoteAudio.unlockAndPlayRemoteSinks`) (`room.page.ts:2657`, `2661-2673`).
2. Remote peers arrive through SFU roster/signaling, streams flow into `remoteStreams`, and `peers()` consumes them (`sfu-client.service.ts:804-828`, `room.page.ts:327-348`).
3. `syncPeers` sees `mixerEnabled` true and pushes tracks into mixer sources (`remote-audio.service.ts:237-260`).
4. Per-element audible-mode branch for Option A does not run because `remoteAudioMixerEnabled` is hardcoded true and tile sinks are intentionally disabled in this mode (`room.page.ts:222`, `room.page.html:229-231`, `14-16`).
5. Output-device switch, mute/volume, and share transitions still operate against mixer-first semantics (`remote-audio.service.ts:191-205`, `197-203`, `321-325`, `room.page.ts:650-659`).
6. Therefore **first break in the revised Option A flow** is at Step 4: there is no active per-publisher per-element playout path, so the Option A path is untestable and all B1-B10 remediations are moot until that architecture flip occurs.

## New issue (11th) found

**11th issue**: No runtime switch exists to migrate away from mixer mode. `remoteAudioMixerEnabled` and `RemoteAudioService.mixerEnabled()` are both unconditional `true` constants (`room.page.ts:222`, `remote-audio.service.ts:191-193`), so even if call-site code is patched for direct `<audio>` sinks, the code never executes that path in production layout. This makes the red-team fixes non-actionable and blocks A/B rollback.

STATUS: REVISE — implementation is still mixer-locked; Option A architecture and most B1-B10 remediation mechanics are not actually in effect, and the first end-to-end break is immediately before any direct per-publisher playback can occur.

# spark CODE red-team CR6 (lens L6: spec-vs-code + observability)
## R1/R2/R3 trace: each = covered+tested / GAP (file:line)

1. R1 (host hears every remote publisher on selected output).
- Covered in code: registry-owned per-publisher `<audio>` playback with ordered `setSinkId(...)` then `play()` in `RemoteAudioService.addPublisher` (`frontend/src/app/services/remote-audio.service.ts:429-494`), no autoplay attr (`:433-437`), sink fallback/error tracking (`:479-538`), and room sink routing excludes those elements from global media query while forwarding to `remoteAudio.applyOutputDevice` (`frontend/src/app/pages/room/room.page.ts:2645-2655`).
- Tested: `RA-REG-1` verifies sink-before-play and no autoplay (`frontend/src/app/services/remote-audio.service.spec.ts:292-302`), fallback/sink routing behavior (`395-409`, `371-393`), and sticky unlock + late-join behavior (`359-369`).
- Gap: no deterministic test asserts that multiple selected-audio-output-specific remote tracks are actually audible concurrently on the selected sink in one real call.

2. R2 (all concurrent remote publishers audible, never one-at-a-time).
- Covered in code: sync/diff loop adds/removes per `publisherClientId` and preserves separate entries in a registry (`frontend/src/app/services/remote-audio.service.ts:256-279` + `:422-424`, `:462-476`), no active-speaker mute gating, and B17 diff in room effect (`frontend/src/app/pages/room/room.page.ts:635-637`).
- Tested: SFU side prevents collapse of simultaneous publishers (`frontend/src/app/services/sfu-client.spec.ts:1524-1578`), and per-publisher publisher replacement is idempotent/deduped (`frontend/src/app/services/remote-audio.service.spec.ts:498-530`, `470-484`).
- Gap: no test directly drives 2+ concurrent remote audio publishers through both SFU + registry to assert 2 audible elements remain unblocked at the same instant.

3. R3 (diagnostics prove decode-vs-sink).
- Covered in code: `remoteAudio.playoutDiagnostics()` exports per-publisher playback state (`paused/muted/volume/sinkId/srcObjectAttached/readyState`) plus selected/effective/fallback sink state (`frontend/src/app/services/remote-audio.service.ts:379-401`), `buildDiagnosticsPayload` stores it (`frontend/src/app/pages/room/room.page.ts:3495-3550`), `sfu-client` exports inbound stats + `media-playout` (`frontend/src/app/services/sfu-client.service.ts:733-775`), and diagnostics UI joins per-publisher row with inbound track metrics (`frontend/src/app/pages/diagnostics/diagnostics.page.ts:111-140`, `527-537`).
- Tested: B16 plumbing and rendering assertions for playout rows, fallback sink labeling, and inbound energy/level mapping (`frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts:109-205`) and diagnostics track-name alignment (`frontend/src/app/services/remote-audio.service.spec.ts:448-463`).
- GAP: no test forces a “decoded-no-playout” failure state to prove a wrong-branch diagnosis path; current coverage is positive assertions plus fallback handling.

## B1-B22 spec-vs-code: any missing/partial/diverged (list)

| B | Spec intent | Status | Evidence | Gap |
| --- | --- | --- | --- | --- |
| B1 | atomic pre-play ordering: set sink then play | PASS | `remote-audio.service.ts:429-494`, `remote-audio.service.spec.ts:292-302` | none |
| B2 | no feedback limiter / AEC-safe path | PASS | central registry `<audio>` path replaces mixed graph (`remote-audio.service.ts:256-280`, `429-476`); no limiter in audible path | no explicit test validating the absence of gain/limiter side effects |
| B3 | no >100% gain | PASS | clamp constants + test migration (`remote-audio.service.ts:62-69`, `247-253`, `:532`), UI max label and tests (`controls-bar.component.html:158-163`, `controls-bar.component.ts:70-73`, `remote-audio.service.spec.ts:304-322`, `532-538`) | none |
| B4 | share/layout dedupe by construction | PASS | dedupe by publisher map key in `syncPeers` and remove/re-add flow (`remote-audio.service.ts:262-279`, `451-475`) and no tile audio path (`tile.component.html:15`; no audio tag for remote peers) | not separately exercised in integration for all layouts |
| B5 | mid-guard, no silent replacement | PASS | `sfu-client.service.ts:1740-1764`, `1818-1821`, `1843`, `IMPL-2` tests | none |
| B6 | recover stalled/all playout paths per element | PASS | `recoverVoicePlayout`, `recoverPlayback`, `replayRegistryElements` (`remote-audio.service.ts:297-308`, `547-574`) + room calls (`2682-2688`, `2690-2698`) | none |
| B7 | sticky-unlock + global interaction | PASS | `unlockAndPlayRemoteSinks` (`2662-2669`) + interaction recovery (`2823-2843`) | none |
| B8 | blocked state from registry paused/blocked + banner | PASS | `refreshBlockedState` + room banner effect (`remote-audio.service.ts:596-603`; `room.page.ts:639-664`; `room.page.html:227-234`) | no explicit screenshot-based assertion of banner UX |
| B9 | per-element volume/mute control | PASS | `setVolume/setMutedAll/applyVolumeState` (`234-254`, `542-545`) and UI bound slider/state (`controls-bar.component.ts:70-73`, `remote-audio.service.spec.ts:304-322`) | none |
| B10 | service-owned playout state | PASS | single registry state signals + debug snapshot (`remote-audio.service.ts:205-214`, `358-377`) | none |
| B11 | registry wiring replaces mixer branch | PASS | room effect invokes syncPeers (`room.page.ts:635-637`); mixer enable always false (`remote-audio.service.ts:234`) and no mixer-enabled bindings remain | remoteAudio debug naming still mentions legacy mixer object, but not user path |
| B12 | late-joiner + unlock semantics | PASS | `syncPeers` + sticky unlock (`429-491`, `282-299`, `2823-286`) and test `359-369` | none |
| B13 | registry `<audio>` no autoplay | PASS | `remote-audio.service.ts:433-437`, `remote-audio.service.spec.ts:292-301` | none |
| B14 | clearRegistry-before-sources + reset order | PASS | `reset -> clearRegistry` (`411-415`), `clearRegistry/destroyRegistryElement` cleanup (`522-526`, `580-594`), reset spec assertions (`325-346`) | none |
| B15 | volume migration <=1.0 + persisted clamp | PASS | constructor migration path (`230-233`, `247-253`), slider capped at 1 (`controls-bar.component.html:158-163`), test (`532-538`) | none |
| B16 | diagnostics B16 payload + media-playout | PASS | `RemoteAudioPlayoutDiagnostics` type (`meeting-sessions.service.ts:353-370`), payload wiring (`room.page.ts:3495-3550`), diagnostics render (`diagnostics.page.ts:133-159`, `527-537`) and specs | none |
| B17 | syncPeers diff-driven add/remove | PASS | `syncPeers` diff logic (`remote-audio.service.ts:256-279`) and room effect integration (`room.page.ts:635-637`) | none |
| B18 | setSinkId timeout fallback to play | PASS | `withTimeout + setSinkId timeout` (`remote-audio.service.ts:619-631`, `479-482`) | no explicit unit test for timeout branch |
| B19 | catch all play attempts and set blocked | PASS | add/replay/play catch (`492-511`, `547-574`), room-level recover calls handle failures (`2682-2688`) | no dedicated test for every path (visibility/pageshow) rejecting unhandledly |
| B20 | sink reject semantics + diagnostics | PASS | `applyMediaElementSinkWithDefaultFallback` + fallback + usedFallback state (`129-156`, `529-540`, `379-385`) | none |
| B21 | track-identity-based change detection | PASS | `currentAudioTrack + track-based sync predicate` (`614-617`, `271-279`), test for track replace (`498-516`) | none |
| B22 | visible mute-all state | PASS | controls show mute state and button icon class/labels (`controls-bar.component.ts:108-110`, `128-139`, `149-151`) | none |

## Observability: can ONE next-call row localize the cause? what's still invisible? (the finding)

Yes for most branches, one diagnostics row is mostly sufficient if interpreted as:
- `entry.payload.sfuDiagnostics.inboundTracks` (publisher/audio track, `bytesReceived`, `audioLevel`, `totalAudioEnergy`) indicates **subscription/decode health**.
- `payload.remoteAudioPlayout.perPublisher` (`paused`, `muted`, `volume`, `sinkId`, `srcObjectAttached`, `readyState`) + top-level `selectedAudioOutputId/effectiveSinkId/usedFallback/blockedPeerIds` indicates **sink routing/playout gating**.

Failure localization with one row:
- `not-subscribed`: no matching inbound track and no per-publisher row; inbound arrays empty or missing `publisherClientId` match.
- `decoded-but-not-played`: inbound `bytesReceived`/`audioLevel` rising while per-publisher row is `paused yes` or peer in `blockedPeerIds`, or `srcObjectAttached` false.
- `played-to-wrong-sink`: per-publisher `sinkId` differs from `selectedAudioOutputId` / `effectiveSinkId` plus `usedFallback=true`.
- `muted`: per-publisher `muted=yes` or low volume path.
- `device-unavailable`: `usedFallback=true` or `effectiveSinkId=''` with `selectedAudioOutputId` unchanged.

GAP that remains invisible in current one-row tuple:
- `autoplay-blocked` is not fully disambiguated from other block reasons because diagnostics omit `playbackFailure` class (e.g., NotAllowedError vs stalled/ended/codec-induced pause). The row can tell “blocked+paused” but not whether it was explicit user-gesture lockout vs another blocked reason.

## NEW bugs (table)

| Severity | File/line | Finding |
| --- | --- | --- |
| medium | `frontend/src/app/services/sfu-client.service.ts` + `frontend/src/app/services/remote-audio.service.spec.ts` | R2 and observability are only partially covered: there is no unit/integration test asserting two live remote publishers stay concurrently unblocked and audible in one call path, and no row-level reason-code for `playbackFailure` to distinguish autoplay lockout from other block causes. |

STATUS: BUGS — R2 and R3 have partial coverage gaps (no direct concurrent-audibility invariant and missing blocked-reason attribution in diagnostics row).

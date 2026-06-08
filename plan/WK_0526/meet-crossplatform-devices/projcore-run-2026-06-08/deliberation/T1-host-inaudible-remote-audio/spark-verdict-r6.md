# spark verdict — T1 round 6

## Q1 — B13-B16 each: correct&sufficient? (gaps file:line)

B13 is NOT correct/sufficient in this codebase. `remote-audio.service.ts` still creates mixer kickstart elements with `autoplay = true` and no registry-only `addPublisher` flow exists (`frontend/src/app/services/remote-audio.service.ts:552-556`, `frontend/src/app/services/remote-audio.service.ts:578-589`). `TileComponent` still renders `<audio ... autoplay playsinline>` and performs `audio.play()` in a component effect, so play can start before service-level sink/volume/mute sequencing (`frontend/src/app/components/tile/tile.component.html:15`, `frontend/src/app/components/tile/tile.component.ts:56-67`). The mixer path still owns playback via hidden kickstarts and `remoteAudio` source graph (`frontend/src/app/services/remote-audio.service.ts:543-542`, `frontend/src/app/services/remote-audio.service.ts:552-565`).

B14 is NOT implemented. There is no registry map keyed by publisher with clear/teardown lifecycle hooks and no `clearRegistry()` in reset. `remote-audio.service.ts` reset only clears mixer sources and graph and never performs per-publisher registry-element teardown (`frontend/src/app/services/remote-audio.service.ts:444-453`, `frontend/src/app/pages/room/room.page.ts:2506-2509`).

B15 is NOT implemented. Volume remains bounded to `1.3`, and the UI permits `max=1.3` with no startup clamp migration path to `min(stored,1)` (`frontend/src/app/services/remote-audio.service.ts:50`, `frontend/src/app/services/remote-audio.service.ts:201-202`, `frontend/src/app/components/controls-bar/controls-bar.component.html:161-163`).

B16 is NOT implemented. `DiagnosticsPayload` has no `RemoteAudioPlayoutDiagnostics` nor per-publisher remote-playout/sink fields, and the payload builder still emits only legacy fields (`frontend/src/app/services/meeting-sessions.service.ts:345-380`, `frontend/src/app/pages/room/room.page.ts:3491-3527`).

## Q2 — internal-contradiction check + exact ordered addPublisher sequence

No contradiction inside the intended design itself, but current code directly contradicts it by keeping mixer as sole owned path (`frontend/src/app/services/remote-audio.service.ts:191-193`, `frontend/src/app/pages/room/room.page.ts:222-230`).

Exact ordered `addPublisher` sequence that satisfies B1+B3+B9+B13:

1) `publisherKey = peer.id` (publisherClientId), dedupe-lookup and remove prior entry for same key.
2) Create one registry `<audio>` per publisher, with `data-remote-audio`, `playsinline`, and **no `autoplay`**.
3) `el.srcObject = stream`.
4) Atomic pre-play state apply: `el.muted = mutedAll`, `el.volume = mutedAll ? 0 : min(volume,1)`.
5) `await setSinkId(selectedSinkId || '')`.
6) `await el.play()`.
7) On `play()` rejection, keep the element in registry and flag that publisher as blocked for diagnostics/bannering.
8) Append/register element in Map and DOM, keep `unlocked` sticky flag behavior.
9) `unlockAll()` path replays steps 5→6 for all registry elements after user gesture; late-joiners inherit the unlocked sticky state.

Current state does not execute this sequence because playback is still driven by mixer sources and per-tile effected elements (`frontend/src/app/services/remote-audio.service.ts:237-260`, `frontend/src/app/components/tile/tile.component.ts:56-67`).

## Q3 — silence hunt (remaining paths)

| Path | Banner? | Auto-recovery? | SILENT-NO-BANNER blocker? |
| --- | --- | --- | --- |
| Legacy mixer path still enabled (`remoteAudioMixerEnabled() === true`) | Yes sometimes via tile `play()` rejection (`frontend/src/app/components/tile/tile.component.ts:56-67`) | Interaction, visibility, effect, keepalive recovery (`frontend/src/app/pages/room/room.page.ts:257-282`, `frontend/src/app/pages/room/room.page.ts:2680-2705`, `frontend/src/app/pages/room/room.page.ts:2815-2819`) | **Yes**: registry design-v2 protections are bypassed, leaving distributed ownership race windows |
| Local output/device permission denied or OS-level exclusive sink/mute | No banner tied directly to OS-output hard-mute state | No dedicated OS-level recovery path | **Yes** |
| Bluetooth handoff / sink device unavailable mid-call (`sinkId` invalid) | Often no banner unless playback rejects and surface emits | `changeAudioOutputDevice`/`applySpeakerDevice` best-effort and `recoverRemoteAudio` may not restore selected path (`frontend/src/app/pages/room/room.page.ts:1030-1043`, `frontend/src/app/pages/room/room.page.ts:2665-2672`) | **Yes** |
| Publisher stream never decodable/silent from network (bytes may stall) | Usually no block banner for intentionally silent or bad stream | Watchdog retries limited (`frontend/src/app/services/remote-audio.service.ts:351-379`, `frontend/src/app/pages/room/room.page.ts:2760-2796`) then stops | **Yes** (false-negative risk) |
| All publishers muted-remotely | No banner by design (`perPeerAllUnpaused` can remain true) | No remote-audio recovery needed/defined for intentional mute | **Expected** if intentional mute; flagged only if interpreted as silent-no-banner bug |
| Host tab throttled/background then resumed | May not stay bannered continuously; recover runs only on `visibility`/interval hooks | `recoverRemoteAudio('visibility')` and interaction recovery exist | **Yes** in long-throttle cases with muted output path |

## Q4 — new issue(s)

**New issue 13:** the registry v2 code path is absent in implementation (`remoteAudioMixerEnabled` remains hardcoded true, mixer branch retained, tile retains playback ownership), so B11–B16 are not currently enforceable and any claimed design-v2 completion is blocked.

STATUS: REVISE — the central per-publisher registry fix is not active in live code; there is a hard BLOCKER that keeps silent-audio regressions possible without a complete B13-B16-compliant path.

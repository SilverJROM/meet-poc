# spark verdict — T1 round 7

## Q1 — completeness gaps (or none)

Not complete. Design v2.1 remains unapplied in code, so multiple required changes have no concrete executable target:

- B11 not active: service still reports mixer enabled and room still renders/uses mixer branch (`frontend/src/app/services/remote-audio.service.ts:191-193`, `frontend/src/app/pages/room/room.page.ts:222`, `frontend/src/app/pages/room/room.page.html:229-231`).
- B12/B17 registry ownership missing: there are no `addPublisher/removePublisher` APIs; `syncPeers()` still drives `this.sources` mixer graph lifecycle (`frontend/src/app/services/remote-audio.service.ts:237-260`, `frontend/src/app/services/remote-audio.service.ts:464-505`).
- B13 not implemented: mixer path still creates `autoplay` audio kickstart elements and tile autoplay path still exists (`frontend/src/app/services/remote-audio.service.ts:552-566`, `frontend/src/app/components/tile/tile.component.html:15`, `frontend/src/app/components/tile/tile.component.ts:56-67`).
- B14 no `clearRegistry()` teardown path exists; `reset()` clears mixer sources only and room cleanup only calls `remoteAudio.reset()` (`frontend/src/app/services/remote-audio.service.ts:444-462`, `frontend/src/app/pages/room/room.page.ts:2507-2509`).
- B15 not done: `MAX_VOLUME`/slider still allow >1.0 and no startup clamp migration to 1.0 (`frontend/src/app/services/remote-audio.service.ts:50`, `frontend/src/app/services/remote-audio.service.ts:201-202`, `frontend/src/app/components/controls-bar/controls-bar.component.html:161-163`, `frontend/src/app/components/controls-bar/controls-bar.component.ts:119-122`).
- B16 not done: diagnostics still lacks first-class playout payload shape and room payload still omits remote audio per-publisher/sink data (`frontend/src/app/services/meeting-sessions.service.ts:345-380`, `frontend/src/app/pages/room/room.page.ts:3491-3527`).
- R6 "recovery hooks preserved/rewired" incomplete because those hooks still call mixer methods and there is no registry branch to recover (`frontend/src/app/pages/room/room.page.ts:2685-2691`, `frontend/src/app/pages/room/room.page.ts:2815-2819`, `frontend/src/app/pages/room/room.page.ts:2821-2823`).

## Q2 — closers re-attack: B14/B17/B18/B19/B20 each OK or gap

`B14` GAP — no disposed guard / no registry teardown ordering. `clearSources()` runs with no `disposed`-equivalent gate and no registry list (`frontend/src/app/services/remote-audio.service.ts:444-505`); `reset()` does not pre-clear remote-owned elements before graph release (`frontend/src/app/services/remote-audio.service.ts:444-462`).

`B17` GAP — no add/remove publisher implementation. `syncPeers()` still compares `this.sources` entries and calls `addSource/removeSource`, not `addPublisher/removePublisher`, so the required per-publisher element registry diff path is absent (`frontend/src/app/services/remote-audio.service.ts:237-258`).

`B18` GAP — no setSinkId timeout + default fallback at add time. `applySinkId()` has no timeout and no `play()` continuation on timeout branch; there is no addPublisher path to wrap it (`frontend/src/app/services/remote-audio.service.ts:652-657`, `frontend/src/app/services/remote-audio.service.ts:260-281`).

`B19` GAP — catch audit not enforced end-to-end. Several play() sites log only; they do not raise blocked state centrally. Example: `unlockAndPlayRemoteSinks()` catches and ignores user-impacting failures (`frontend/src/app/services/remote-audio.service.ts:282-291`) and `recoverPlayback()` catches output play errors without converting to a blocked signal (`frontend/src/app/services/remote-audio.service.ts:337-346`).

`B20` GAP — sink-reject outcome not surfaced into remotaudio diagnostics and no post-fallback routing visibility. `applyMediaElementSinkWithDefaultFallback()` can fail both selected and default (`frontend/src/app/services/remote-audio.service.ts:85-111`) but callers ignore result and no B16-style `selectedSinkId/effectiveSinkId/sinkApplied` tuple is emitted (`frontend/src/app/services/remote-audio.service.ts:321-326`, `frontend/src/app/pages/room/room.page.ts:3491-3527`).

## Q3 — in-scope silence sweep: any silent-no-banner path? (name it or "none")

Remaining in-scope silent-no-banner risk in JROM Chrome path:

1) Sink routing failure can be swallowed while banner logic still evaluates against mixer state:
- `applyMediaElementSinkWithDefaultFallback()` can return `false` when both selected/default sink routing fails (`frontend/src/app/services/remote-audio.service.ts:94-111`).
- The mixer playback paths do not use that boolean as gating for `remoteAudioBlocked`/recovery (`frontend/src/app/services/remote-audio.service.ts:282-291`, `frontend/src/app/services/remote-audio.service.ts:337-346`, `frontend/src/app/pages/room/room.page.ts:2667-2671`).
- Net effect: UI can keep reporting recoverable/playing based on `play()`/context flags while selected sink failures are not converted into a deterministic blocked signal.

2) The same issue is multiplied by `remoteAudioMixerEnabled() === true`, which disables tile-level `<audio>` ownership and suppresses distributed `<audio>` registry signals entirely (`frontend/src/app/pages/room/room.page.ts:222`, `frontend/src/app/pages/room/room.page.html:253-274`, `frontend/src/app/pages/room/room.page.html:293`, `frontend/src/app/components/tile/tile.component.ts:56-67`).

## Q4 — "NO NEW ISSUE — design v2.1 complete and implementation-ready"  OR  new item(s)

New issue: v2.1 is not implemented in live code; the system remains on pre-v2 mixer ownership, so implementation-ready status is blocked.

Status-specific blocker list is above (B11/B13/B14/B15/B16 + B17/B18/B19/B20 all not applied end-to-end).

STATUS: REVISE — switch to service-owned per-publisher registry flow first; no concrete evidence of design v2.1 being active in code yet

# gpt54 verdict — T1 round 5
## Q1 — Ownership: service-owned vs tile-registered — pick + why (file:line)
Pick: `service-owned`.

Why this is the correct ownership model in this app:
- The core failure being fixed is ordering and state authority. The current tile effect attaches `srcObject`, hardcodes `audio.muted = false`, then immediately `play()`s at [tile.component.ts:56-66](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.ts:56). That is exactly the race the registry is meant to remove. If tiles still create the elements, ownership stays split and the service is again racing a component lifecycle.
- A service-owned element still participates in the existing global routing/recovery code because those paths operate on `document.querySelectorAll('video, audio')` at [room.page.ts:2648-2655](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2648) and `audio[data-remote-audio]` at [remote-audio.service.ts:282-292](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:282), [remote-audio.service.ts:386-395](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:386). Elements do not need to live inside Angular’s template tree to be found there.
- Cleanup is already centralized in `cleanupCall()` calling `remoteAudio.reset()` at [room.page.ts:2440-2507](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2440), so a service-owned registry has a natural teardown point. The registry implementation just has to extend `reset()` to remove owned elements the same way kickstart elements are currently removed.
- Tile-owned registration is worse because the tile loops still track by `participantId` today at [room.page.html:272](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:272) and [room.page.html:286](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:286). Any DOM reuse bug there should not be allowed to control audio ownership.

Pitfalls the service-owned design must explicitly handle:
- `reset()` must destroy registry elements on call end, not just mixer sources.
- The service must expose authoritative blocked/paused state to the room because `remoteAudioBlocked` can no longer infer anything from tile existence.
- If the service appends elements to `document.body` or another global container, those elements still need stable `data-peer-id`/publisher ids for watchdog recovery and diagnostics.

## Q2 — B12 join-order table: (a)(b)(c)(d)(e) each = HEARD / NEEDS-CLICK(banner?) / SILENT-NO-BANNER(gap)
Assuming the registry design is implemented as specified, plus R4’s required per-element banner rewrite:

- `(a) publisher A subscribes BEFORE the host's first gesture`:
  `NEEDS-CLICK (banner yes)`.
  `addPublisher()` would set sink/volume/mute then `play()`. Without prior gesture, autoplay can reject. The design says register anyway and set `remoteAudioBlocked` on reject. The room already shows the banner when `handleRemoteAudioBlocked()` fires at [room.page.ts:1045-1050](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:1045). `unlockAll()` is then recoverable through the existing gesture path at [remote-audio.service.ts:282-292](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:282). No permanent silent-no-banner if B8 is truly rewritten.

- `(b) B joins AFTER the host gestured once`:
  `HEARD`.
  This is the point of sticky `unlocked=true`. Once the host has gestured, `addPublisher()` can `play()` immediately for later joiners without another click. The current code already has a generic replay loop for all `audio[data-remote-audio]` on a real gesture [remote-audio.service.ts:282-292](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:282); the registry makes that state sticky rather than transient.

- `(c) BOTH join before any gesture`:
  `NEEDS-CLICK (banner yes)`.
  Same as (a), but for two elements. Both stay registered, both get replayed by `unlockAll()`. As long as B8 uses registry non-empty + any blocked element, the user gets the banner rather than silent failure.

- `(d) host gestures, A joins, host never clicks again, B joins much later`:
  `HEARD`.
  Sticky unlock should fully close this. There is no dependency on another click if `unlocked` is stored in the service and `addPublisher()` honors it. This is exactly the case the raw tile effect could not solve.

- `(e) host backgrounds/resumes then C joins`:
  `HEARD`, but only if `recoverRemoteAudio('visibility')` is rewritten for the registry.
  Today resume hooks call `recoverRemoteAudio('visibility')` at [room.page.ts:2852-2857](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2852) and [room.page.ts:2876-2879](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2876). Current `recoverPlayback()` is mixer-biased and becomes a no-op under `!mixerEnabled()` except for `allSinksPlaying()` at [remote-audio.service.ts:328-349](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:328). So B12 is only fully closed if that branch is replaced with “iterate registry, re-set sink, replay paused elements.” If that rewrite lands, C is heard without a new click; if not, (e) regresses.

Bottom line:
- No join-order case is intrinsically `SILENT-NO-BANNER` in the registry design.
- Case `(e)` depends on B7/B8 actually being implemented, not just described.

## Q3 — B4 dedup-by-construction holds? (or path that breaks it, file:line)
`Dedup-by-construction` holds if and only if the registry key is `publisherClientId` / `peer.id` and audio ownership is entirely decoupled from tile rendering.

Why it holds under the registry:
- Share-stage, strip, grid, and pip can render the same peer multiple times, but if audio is not owned by tiles, those duplicate visual tiles no longer create duplicate `<audio>` elements.
- The current echo path exists because share layout renders `presenter` in the stage [room.page.html:247-258](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:247) and still renders `orderedStripPeers()` unchanged in the strip [room.page.ts:444](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:444), [room.page.html:271-273](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:271). Registry ownership breaks that coupling.

Paths that can still break it if implemented carelessly:
- If the registry is keyed by `participantId` instead of `peer.id`, same-user multi-device clients collide. The consensus already calls this out; current tile loops still use `participantId` as DOM key at [room.page.html:272](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:272), [room.page.html:286](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:286). The registry must not repeat that mistake.
- If `removePublisher()` is asynchronous and a rejoin calls `addPublisher()` before the old entry is cleared, two live elements for the same client id can exist transiently. The spec says `removePublisher(id): pause, null srcObject, remove from DOM + map`, which is correct, but implementation needs to make replacement atomic when the same `publisherClientId` is seen again.
- `screen+camera from same publisher` is not a dedup problem as long as only the audio publisher stream is keyed in the registry. Screen share is a video duplication issue, not an audio registry issue.

So:
- `B4` is fully closed by construction only with strict single ownership + `publisherClientId` keys + atomic replace-on-rejoin.

## Q4 — 13th issue (or "NO NEW ISSUE — registry design complete")
13th issue:
- `stale persisted 1.3 volume becomes UI/playback divergence after Option A`.
  The service persists volume directly from the old mixer model at [remote-audio.service.ts:200-205](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:200) and reads it back raw from localStorage at [remote-audio.service.ts:669-676](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:669). `MAX_VOLUME` is still `1.3` at [remote-audio.service.ts:49-50](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:49). Under Option A, playback is supposed to clamp to `min(volume,1)`, but unless storage/state are migrated, a returning user can still have `volume() === 1.3` in service state while actual element playback is capped at `1.0`. That means the controls bar can show 130% while the registry is audibly playing 100%. The packet explicitly hinted at this risk, and it is not fully covered in the registry consensus.
  Correct fix: migrate stored volume on startup to `min(parsed,1)`, lower the slider max to `1.0`, and persist the clamped value so state/UI/playback stay aligned.

STATUS: REVISE — service-owned registry is the right design, B12 is closed only if visibility/interaction recovery is rewritten for the registry branch, and stale persisted 1.3 volume is still an uncovered mismatch.

# Spark Verdict — Round 5

## Q1 ownership model (central per-publisher registry)
Not implemented.
- [remote-audio.service.ts:191-193](#)
  - `mixerEnabled()` is hardcoded to `true`, so service never operates in the registry-only mode.
- [remote-audio.service.ts:206-261](#)
  - Maintains mixer `sources` and source-graph operations (`addSource`/`removeSource`) rather than publisher-owned per-element ownership.
- [room.page.ts:222](#)
  - `remoteAudioMixerEnabled` is hardcoded `true`, forcing mixer path at page level too.
- [tile.component.ts:56-67](#)
  - Tiles still perform direct `audio.play()` and autoplay-handling themselves, so tiles still own playback.
- Net: authority remains split between service and each tile; no single service-owned registry object is controlling one element per publisher.

## Q2 B12 late-joiner silence for join orders a-e
Not fully closed.
- [remote-audio.service.ts:263-292](#)
  - `unlockAndPlayRemoteSinks` is a best-effort per-element resume flow tied to `querySelectorAll('[data-remote-audio]')`; no authoritative registry replay path.
- [tile.component.ts:56-67](#)
  - A tile can only recover itself after mount/autoplay attempts, which is still subject to element timing and join-order race.
- [room.page.ts:650-680](#)
  - Host-side recovery effect is mixer-flag gated (`mixerEnabled`/`remoteAudioMixerEnabled`) and tied to `hasSources`, not publisher registry state.
- Net: Late joiners (a-e) still have no guaranteed path guaranteeing silent-join unlock state restoration.

## Q3 share-dedup-by-construction
Not achieved.
- [remote-audio.service.ts:237-261](#)
  - Sync logic assumes mixer transport and updates sources via `syncPeers` deltas, not publisher-entry dedupe as a construction invariant.
- [room.page.ts:260+](#)
  - Remote publisher audio lifecycle is still per-tile and can still create duplicate playback elements by render path/order changes.
- Net: dedupe by construction is not encoded; behavior still depends on component rendering and sync timing.

## Q4 13th issue
13th issue found: dead codepath / feature-strand lock-in.
- [remote-audio.service.ts:191-193,263-292](#)
  - `mixerEnabled` hardcoded true plus no feature-gated switch prevents registry implementation from being activated.
- [room.page.ts:222,650-680](#)
  - Page-level switches and recovery effects are hardwired to mixer mode, so adopting the registry design cannot be rolled in without manual deep refactor.
- Impact: even if registry code is added later, current architecture cannot execute it.

STATUS: BLOCKED — central registry ownership and B12 guarantees are not implemented in code.

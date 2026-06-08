# gpt54 verdict — T1 round 4
## Q1 — Architecture: Option A confirmed? (or named alternative + why) — evidence file:line
`Option A` is the right fix for the actual host bug.

Why:
- It closes `A4` regardless of whether `A3` also happened. The host failure was “selected non-default output device + our app silent + Meet worked.” Direct `<audio srcObject=remoteStream>` is the exact path the app already uses in tiles at [tile.component.html:14-15](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:14) and [tile.component.ts:56-66](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.ts:56); it avoids routing a `MediaStreamAudioDestinationNode.stream` through `setSinkId`, which is the fragile path implicated in `A4`.
- It makes `A3` structurally impossible in the audible path. `A3` depends on the Web-Audio graph in [remote-audio.service.ts:507-535](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:507) plus `addSource()` at [remote-audio.service.ts:464-478](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:464). If remote audio is not audibly routed through that graph, the orphaned graph can no longer silence the call.
- `Option B` is not safer because it reintroduces a Web-Audio destination stream in the audible path, which is the exact class of sink-routing problem Option A is trying to eliminate.

What still depends on the mixer/AudioContext today:
- `attachOutputElement()/syncPeers()/outputPlaying/contextState/hasSources` at [room.page.ts:632-680](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:632) are mixer-specific and must be rewritten.
- `recoverPlayback()` / `recoverVoicePlayout()` are mixer-centric today at [remote-audio.service.ts:328-379](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:328).
- `applyOutputDevice()` and `unlockAndPlayRemoteSinks()` already have a direct-element path and survive Option A if the service is slimmed, not deleted, at [remote-audio.service.ts:263-318](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:263), [remote-audio.service.ts:321-325](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:321).

Conclusion:
- `Option A` fixes the bug whether the live trigger was `A4` alone or `A4 + A3`.
- No third design is safer for JROM’s reported failure because any design that keeps a Web-Audio destination stream in the audible path preserves the highest-risk mechanism.

## Q2 — B1-B10 verification table: each = OK / FIX-NEEDED(detail file:line)
| blocker | verdict | evidence / exact correction |
| --- | --- | --- |
| `B1 volume + mute-all` | `OK, but only if BOTH halves ship` | The requirement is concrete enough: state stays in `RemoteAudioService.setMutedAll/setVolume` [remote-audio.service.ts:195-205](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:195), and tile audio must react to that state instead of hardcoding `audio.muted = false` [tile.component.ts:61](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.ts:61). Without the tile-side reactive apply, future elements won’t inherit current state. |
| `B2 feedback limiter lost` | `OK as a deliberate tradeoff, not a bug-fix blocker` | The limiter exists only in the mixer path at [remote-audio.service.ts:56-58](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:56) and [518-527](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:518). Removing it is acceptable for fixing JROM’s remote-audio failure if explicitly documented. It is a product tradeoff, not a hidden implementation hole. |
| `B3 130% boost impossible` | `OK, but UI must change with it` | The slider still exposes `max="1.3"` at [controls-bar.component.html:160-164](/home/agjrom/websites/meet-poc/frontend/src/app/components/controls-bar/controls-bar.component.html:160). If Option A caps native element volume at `1.0`, the UI must be capped too; otherwise it lies. |
| `B4 share dedup / echo` | `FIX-NEEDED` | The requirement is too hand-wavy. Today `orderedStripPeers = this.peers()` at [room.page.ts:444](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:444), so in share layout the presenter renders in the stage [room.page.html:247-258](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:247) and again in the strip [room.page.html:271-273](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:271). The correct fix is not just “guard/dedup”; it must filter `orderedStripPeers()` to exclude `sharingPeer().id` and track by `peer.id`, not `participantId`. |
| `B5 reclaim-safe mid guard` | `FIX-NEEDED` | The requirement is directionally right but incomplete. The current overwrite happens at [sfu-client.service.ts:1751-1754](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1751). Errors then feed capped retry logic at [sfu-client.service.ts:199-221](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:199) and [1100-1133](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1100). To be “correct,” the guard must define staleness using live ownership checks and, on reclaim, clear both `midToEntry` and `subscribedTracks` for the prior owner before rebinding. Otherwise a legitimate reuse can still strand a publisher after capped retries. |
| `B6 watchdog per-element recovery` | `FIX-NEEDED` | The intent is correct, but current DOM gives no way to target “the stalled publisher’s element”: tile audio has only `data-remote-audio` at [tile.component.html:15](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:15), no peer id. `recoverVoicePlayout(peerId, ...)` receives a peer id from the watchdog at [room.page.ts:2796](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2796), so the fix must also add a stable `data-peer-id` / similar attribute to the tile audio element. |
| `B7 recoverPlayback !mixerEnabled early-return` | `OK, but only if service semantics are changed` | Current code returns `allSinksPlaying()` and does no replay when `!mixerEnabled()` at [remote-audio.service.ts:328-329](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:328). Revised requirement is correct: this branch must become “iterate tile audio elements, reapply sink, replay paused elements,” not a no-op. |
| `B8 banner per-element authority` | `FIX-NEEDED` | The requirement is incomplete. Today banner logic is mixer-bound at [room.page.ts:650-659](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:650). Simply checking “any per-element is paused/blocked” is not enough, because zero/missing tile elements would incorrectly pass. Correct fix: derive the expected set of remote peer ids with streams from `peers()` and assert one corresponding tile audio element exists and is playable for each. |
| `B9 sink-before-play / mount race` | `OK` | This is concrete and necessary. Current tile audio effect plays immediately after `srcObject` attach [tile.component.ts:60-63](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.ts:60), while room-level sink application runs asynchronously later on `peers()` / device changes [room.page.ts:686-690](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:686). Setting sink in-tile before `play()` is the right fix. |
| `B10 don’t delete RemoteAudioService` | `OK` | Concrete and correct. The service still owns shared speaker state [remote-audio.service.ts:160-205](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:160), generic tile unlock [remote-audio.service.ts:282-292](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:282), and sink routing helpers [remote-audio.service.ts:85-156](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:85). |

## Q3 — End-to-end trace: first breaking step (or "no break found across all steps")
Trace against the revised design:

1. `join (host gesture)`:
   Works under Option A if `unlockAndPlayRemoteSinks()` is preserved because it already targets `audio[data-remote-audio]` elements at [remote-audio.service.ts:282-292](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:282).
2. `host publishes`:
   Unchanged; not on the remote playout path.
3. `publisher A subscribes and becomes audible on selected device`:
   Works if `B9` is implemented, because tile audio exists [tile.component.html:14-15](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:14) and the sink can be set before `play()`.
4. `publisher B joins, both audible concurrently`:
   Works structurally with per-peer tiles if the loops key by `peer.id`, not `participantId`.
5. `host picks a different output device mid-call`:
   Works because room effect reapplies speaker device on `selectedAudioOutputId()` / `peers()` changes at [room.page.ts:686-690](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:686) using all `video, audio` elements at [room.page.ts:2648-2655](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2648).
6. `host volume slider / mute-all`:
   Works only if B1/B3 are implemented as above.
7. `A starts screen-share`:
   **First breaking step.** With the current room design, the sharing peer is rendered once in the stage [room.page.html:247-258](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:247) and again in the strip because `orderedStripPeers()` is all peers [room.page.ts:444](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:444) and the template iterates them all [room.page.html:271-273](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:271). If tile audio is re-enabled naïvely, the presenter gets two audible elements and echoes. This breaks before stop-share, leave/rejoin, background/resume, or talk-state changes.

So the first failing step in the revised design is:
- `publisher A starts screen-share`.

## New issue (11th+) found  — or  "NO NEW ISSUE — revised design complete"
New issue found:
- `11th issue: DOM keying by participantId can collapse or reuse the wrong remote audio tile.` The room loops still use `track peer.participantId` in both share-strip and grid at [room.page.html:272](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:272) and [room.page.html:286](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:286). Two live devices from the same participant can therefore share a DOM key, which risks one tile/audio element being reused or dropped. This is independent of B4’s share-echo duplication and directly violates the “everyone audible concurrently” directive. Fix: track by `peer.id` / clientId everywhere tiles are rendered.

STATUS: REVISE — Option A is correct, but B4/B5/B6/B8 are not yet concrete enough and the first revised-design break is still screen-share due to duplicate audible presenter rendering plus participantId key collisions.

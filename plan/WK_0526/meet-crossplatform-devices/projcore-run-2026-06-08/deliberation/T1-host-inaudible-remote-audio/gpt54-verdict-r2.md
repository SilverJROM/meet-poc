# gpt54 verdict — T1 round 2
## Q1 — A-mechanism ranking (with the discriminator evidence file:line)
Most likely to least likely against the four host facts: `(no banner) + (silence) + (specific output device selected) + (other apps + Meet audible on same device)`.

1. `A4 sinkId / single-mixer-output routing` — best fit.
   The only audible path in mixer mode is the single shared mixer `<audio>` at [room.page.html:229-230](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:229). Per-tile remote `<audio>` elements are not even rendered when mixer mode is on because every tile gets `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` at [room.page.html:253](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:253), [room.page.html:273](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:273), [room.page.html:293](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:293), while the tile only renders remote audio when `remoteAudioEnabled()` is true at [tile.component.html:14-15](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:14). The app applies the selected output device to that single output via `remoteAudio.applyOutputDevice()` and also to all media elements via `applyMediaElementSinkWithDefaultFallback()` at [room.page.ts:2648-2658](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2648) and [remote-audio.service.ts:652-655](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:652). If `setSinkId()` succeeds but the mixer-destination stream is not actually audible on that selected device, the code has no further fallback because fallback only happens on rejected `setSinkId()` at [remote-audio.service.ts:85-112](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:85). This exactly matches “specific device selected, other apps audible, Meet works, our app silently fails.” What I can prove: the app routes all remote audio through one sink-routed mixer element. What I cannot prove from code alone: Chrome’s exact runtime behavior for `setSinkId()` on a `MediaStreamAudioDestinationNode` stream.

2. `A3 orphaned graph after context unexpectedly becomes closed` — strong secondary fit.
   If `this.context.state === 'closed'` but `gain` / `limiter` / `destination` are still non-null, `ensureGraph()` recreates only `this.context` and reuses the old nodes at [remote-audio.service.ts:507-535](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:507). `addSource()` then creates a source in the new context and calls `source.connect(this.gain!)` at [remote-audio.service.ts:464-468](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:464), which would throw if `gain` belongs to the old closed context; the catch at [remote-audio.service.ts:475-476](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:475) swallows the failure and never inserts the source, so `sources.size` stays `0`. That suppresses the banner because the room effect returns early when `!hasSources` at [room.page.ts:650-659](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:650), and the playability fn also treats `sourcesCount===0` as fine at [remote-audio-playability.ts:33-49](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio-playability.ts:33). This is the cleanest code explanation for “silent with no banner.” It is ranked below A4 because the host’s selected-device evidence points harder at routing than at an unexpected `closed` context, and the code only explicitly closes the context in `reset()` which also nulls the nodes at [remote-audio.service.ts:444-455](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:444). So A3 fits well, but it still needs an external/unexpected close event.

3. `A5 single shared mixer element as architectural single point of failure`.
   This is not the direct mechanism, but it is the structural reason A4/A3 can take out every remote at once. All remote audio funnels into one destination stream at [remote-audio.service.ts:528-533](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:528), bound to one output element at [remote-audio.service.ts:538-543](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:538). That matches “host heard neither publisher,” but by itself it does not discriminate between sink and graph failure.

4. `A1 output not pre-warmed from gesture because of sources-size guard`.
   `unlockAndPlayRemoteSinks()` only calls `output.play()` when `this.sources.size > 0` at [remote-audio.service.ts:294-304](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:294). During join, `unlockAudioFromGesture()` runs before remote sources exist at [room.page.ts:853](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:853) and [room.page.ts:861](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:861). This is a real bug, but it is only a partial explanation because once sources arrive the service immediately tries `recoverPlayback()` at [remote-audio.service.ts:474](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:474); if that failed in a visible way with sources present, the banner path should usually engage.

5. `A2 suspended context / non-gesture resumes rejected`.
   The code explicitly says non-gesture callers leave the context non-running at [remote-audio.service.ts:266-277](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:266), and the room does call `unlockAudioFromGesture()` from `setTimeout(0)` after sync at [room.page.ts:635-639](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:635). But with sources present, the banner should flip on because `remoteAudioBlocked` is set when `hasSources && !(context running && outputPlaying)` at [room.page.ts:650-659](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:650). The host explicitly saw no banner, so pure A2 is demoted hard.

6. `A6 keepalive oscillator gain=0 causes auto-suspend`.
   This is too speculative from the current code. The oscillator exists at [remote-audio.service.ts:621-633](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:621), but nothing in the host evidence specifically points here, and if it manifested as a non-running context with sources the banner issue from A2 applies again.

Bottom line for Q1:
- Best single match to all four host facts: `A4`.
- Best code explanation for `no banner`: `A3`.
- `A2` is not the lead mechanism after the host addendum.

## Q2 — Anomaly B verdict: REAL-BUG (B1) or SEQUENTIAL (B2) — proof file:line
Verdict: `SEQUENTIAL (B2)` from the code path, with one important caveat: `B1` is a real latent defect, but it is not required to explain this session.

Proof from code that concurrent publishers are supported when mids remain distinct:
- `subscribeIfNeeded()` gates by `publisher.clientId`, not globally, so publisher 2 can subscribe while publisher 1 remains subscribed at [sfu-client.service.ts:150-165](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:150).
- `processOntrack()` stores streams per `publisherClientId`; for non-screen tracks it gets/creates `remoteStreams().get(entry.publisherClientId)` and `addTrack(event.track)` without touching other publishers at [sfu-client.service.ts:804-829](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:804).
- The room consumes those streams per `clientId` into separate `PeerState`s at [room.page.ts:326-344](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:326), and the mixer then adds one source per `peer.id` at [remote-audio.service.ts:243-257](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:243). Nothing in that normal path evicts publisher 1 when publisher 2 arrives.
- Teardown only happens on explicit retry/reset / reconnect / leave paths, e.g. `clearPublisherSubscriptionStateForRetry()` deleting a specific publisher’s mids and stream at [sfu-client.service.ts:1016-1045](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1016), or cfSessionId change at [sfu-client.service.ts:933-963](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:933).

Why I am not calling B1 the round-2 verdict:
- The no-renegotiation branch really does blindly write `this.midToEntry.set(rt.mid, entry)` at [sfu-client.service.ts:1748-1754](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1748). If Cloudflare ever reuses a remote `mid`, publisher 2 could steal publisher 1’s mapping. That is a real bug in the client.
- But the code’s intended steady-state model is additive concurrency, not displacement. With distinct mids, both publishers coexist.
- The host evidence timeline itself has a gap: peer2 audio through `00:26:45`, then no inbound audio at `00:26:52`, then phone at `00:27:00` [diagnostics-evidence-2026-06-08.md:16-33](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/diagnostics-evidence-2026-06-08.md:16). That timeline is fully compatible with sequential sessions and does not require concurrent displacement.

So for this anomaly:
- `B2` explains the observed session.
- `B1` is still a defect I would fix because the code is unsafe under `mid` reuse.

## Q3 — Fix set: [per-publisher-elements | patch-mixer] + concrete change list (file:line) + R3 diag fields
Verdict: `per-publisher-elements`.

Reason:
- It removes the exact single-point-of-failure architecture implicated by the host addendum.
- It dissolves `A1`, `A3`, `A4`, and `A5` in one move.
- The repo already has the per-publisher `<audio>` path implemented in `TileComponent`; the mixer currently disables it.
- The existing speaker-device effect already reapplies `sinkId` across all `video, audio` elements on peer changes, so the device-routing path survives the architecture change at [room.page.ts:685-690](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:685) and [room.page.ts:2648-2658](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2648).

Concrete change list I would commit:
- `frontend/src/app/pages/room/room.page.html`
  - Remove the shared mixer output element at [229-230](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:229).
  - Stop forcing tiles into mixer-disabled remote audio by removing `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` at [253](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:253), [273](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:273), [293](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:293), so each remote tile’s own `<audio data-remote-audio>` at [tile.component.html:14-15](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:14) becomes the audible path.
- `frontend/src/app/components/tile/tile.component.ts`
  - Keep the existing per-publisher play path at [56-66](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.ts:56) as primary. That is the Meet-style model.
  - If we keep a “blocked” banner, emit it from this per-element path only, not from mixer-state heuristics.
- `frontend/src/app/pages/room/room.page.ts`
  - Remove mixer-specific attach/sync/recover effects at [632-680](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:632), including the `hasSources` banner logic at [650-659](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:650) that currently suppresses failure when no sources materialize.
  - Keep `applySpeakerDevice()` at [2648-2658](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2648), because it already covers all media elements and is exactly what per-publisher sinks need.
- `frontend/src/app/services/remote-audio.service.ts`
  - Retire the Web-Audio mixer graph as the mandatory playout path: `syncPeers()` [237-260](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:237), `addSource()` [464-478](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:464), `ensureGraph()` [507-535](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:507), `bindOutputElement()` [538-543](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:538), and the gesture/recovery machinery [263-318](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:263), [328-379](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:328).
  - Keep only the sinkId helper if still useful, or delete the service entirely if the room page can use `applyMediaElementSinkWithDefaultFallback()` directly.
- `frontend/src/app/services/sfu-client.service.ts`
  - Independently fix the latent B1 defect in the no-renegotiation branch at [1748-1754](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1748): if `rt.mid` is already owned by a different `{publisherClientId, trackName}`, fail loudly and retry rather than overwrite.
  - Keep the additive concurrent model in `processOntrack()` [804-829](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:804).

R3 diagnostics I would add even with the per-publisher fix:
- In `SfuInboundTrackStats` / `collectDiagnostics()` at [meeting-sessions.service.ts:280-292](/home/agjrom/websites/meet-poc/frontend/src/app/services/meeting-sessions.service.ts:280) and [sfu-client.service.ts:728-752](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:728):
  - `mid`
  - `receiverTrackId`
  - `receiverTrackMuted`
  - `receiverTrackReadyState`
  - `audioLevel`
  - `totalAudioEnergy`
  - `totalSamplesDuration`
  - `concealedSamples`
  - `silentConcealedSamples`
  - `jitterBufferEmittedCount`
  - `insertedSamplesForDeceleration`
  - `removedSamplesForAcceleration`
- Also capture `media-playout` stats rather than relying only on `inbound-rtp`, because the current collector only reads `inbound-rtp` fields at [sfu-client.service.ts:728-752](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:728), which is why the current session could not prove decode-vs-sink.
- Capture per-element playout state on the host:
  - each remote tile audio element’s `paused`, `readyState`, `currentTime`, `sinkId`
  - map each to `peer.id` / `publisherClientId`
  - emit the selected output device id that the room applied
- Emit the live `midToEntry` map each sample so any future `mid` collision is immediately visible.

If the team insists on keeping the mixer instead, I would still require:
- fix `A3` by recreating `gain` / `limiter` / `destination` when the context is recreated,
- fix `A1` by prewarming the output element from the join gesture even with zero sources,
- and fix `B1` by guarding `mid` ownership.
But I would not choose that route; it keeps the architecture that the host evidence most strongly condemns.

## New issues found this round (or "no new issue beyond R1")
No new separate issue beyond R1.

One sharper discriminator did emerge from the code:
- In mixer mode there are zero per-tile `audio[data-remote-audio]` elements because the template disables them [room.page.html:253](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:253), [room.page.html:273](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:273), [room.page.html:293](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:293), [tile.component.html:14-15](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:14). Therefore `elements.every(...)` is vacuously true, and if `sources.size` never increments the playability logic reports fine / no banner [remote-audio-playability.ts:35-49](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio-playability.ts:35). That is not a new bug family; it is stronger evidence for `A3`-style banner suppression.

STATUS: AGREE — rank A4 then A3, treat B as sequential in this session but fix the latent no-renegotiation `mid` overwrite anyway, and replace the single mixer playout path with per-publisher unmuted audio elements plus R3 playout/decode diagnostics.

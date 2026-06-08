# gpt54 verdict — T1 round 7
## Q1 — completeness gaps (or none)
Two completeness gaps remain if I read v2.1 as the implementer who must ship it without inventing policy:

- `Contradictory addPublisher spec in the design doc itself.` The top-level registry section still says create `<audio data-remote-audio autoplay playsinline>` at [consensus-r4-registry.md:11-15](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:11), while B13 later says the registry element `MUST NOT` have `autoplay` at [consensus-r4-registry.md:41-42](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:41). The implementer can resolve this by following B13, but the document is not internally normalized yet.

- `B17 wiring is still behaviorally ambiguous on “changed publishers.”` B17 says `syncPeers` becomes a diff that calls `addPublisher(id,stream)` for `new/changed publishers` at [consensus-r4-registry.md:48-49](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:48), but it does not explicitly state the change predicate. The current mixer path already defines the correct predicate in code: same peer id is stable, but replace when `stream !== current.stream` **or** `currentAudioTrack(stream) !== current.track` at [remote-audio.service.ts:243-257](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:243). That exact rule needs to be lifted into the registry design, or the implementer still has to choose.

Everything else is concrete enough:
- service ownership target = `RemoteAudioService`
- room wiring target = the existing `this.remoteAudio.syncPeers(this.peers())` effect at [room.page.ts:635](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:635)
- banner/recovery rewrite targets = [room.page.ts:650-680](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:650), [room.page.ts:2685-2689](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2685)
- sink helper target = [remote-audio.service.ts:85-112](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:85)

## Q2 — closers re-attack: B14/B17/B18/B19/B20 each OK or gap
- `B14-guard`: `OK`, with one refinement already implied by the text.
  The added race guard says set disposed/not-in-call before reset and re-check after the awaited `setSinkId` before append at [consensus-r4-registry.md:53](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:53). That is sufficient in single-threaded JS for the only awaited step in `addPublisher`. I do not see another async gap if `play()` happens only after append/register and is `.catch()` audited under B19.

- `B17 wiring`: `gap`.
  The wiring target is right, but the rule for “changed” is not explicit enough. The current SFU path keeps one `MediaStream` per `publisherClientId` and mutates it with `addTrack(event.track)` at [sfu-client.service.ts:820-827](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:820). That means a publisher can change audible track without changing client id and without necessarily changing stream object identity. The registry diff must therefore match the current mixer semantics: compare both `stream` and the current live audio track identity, not only `publisherClientId`.

- `B18 timeout`: `OK`.
  Wrapping `setSinkId` with timeout and then playing anyway on timeout at [consensus-r4-registry.md:50](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:50) is correct for the original bug class because it prevents silent blocking on sink enumeration. In JROM’s environment the default device is audible, so this degrades to “audible on default / wrong sink,” not silent-no-banner. B16/B20 must log that the selected sink was not applied.

- `B19 catch audit`: `OK`.
  This is the right closer. Today the design depends on multiple replay paths already wired in room page interaction/visibility hooks at [room.page.ts:2799-2818](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2799) and [room.page.ts:2852-2879](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2852). Making every `play()` path set blocked on rejection is exactly what closes silent-no-banner on autoplay/recovery failures.

- `B20 sink-reject`: `OK`.
  The existing helper already falls back to `''` default on selected-sink reject at [remote-audio.service.ts:94-110](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:94). Design v2.1’s requirement to mark blocked only if both selected and default fail is the correct behavior for Chrome in scope. This preserves audibility whenever possible and only banners true sink failure.

## Q3 — in-scope silence sweep: any silent-no-banner path? (name it or "none")
`None`, if v2.1 is implemented with the B13 override and an explicit B17 “stream or current-audio-track changed” diff.

Why I am comfortable saying that for JROM’s in-scope environment:
- `autoplay / first gesture failure` becomes bannered by B19+B8, not silent.
- `late joiner after first gesture` is covered by sticky unlock + interaction recovery [consensus-r4-registry.md:21-23,54](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:21).
- `selected sink reject` falls back to default, so not silent [remote-audio.service.ts:94-110](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:94).
- `selected sink hang` times out then plays anyway under B18, so not silent [consensus-r4-registry.md:50](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:50).
- `background/resume` is auto-replayed via preserved visibility/pageshow hooks [room.page.ts:2852-2879](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2852).
- `reset / leave / rejoin race` is closed by B14-guard if implemented literally [consensus-r4-registry.md:53](/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md:53).

The only residual risk I found is not a runtime mechanism but a spec ambiguity: if the implementer misreads B17 and only diffs by client id or stream object, mid-call track replacement can leave the registry bound to the wrong track. That is why I am not rubber-stamping implementation-readiness yet.

## Q4 — "NO NEW ISSUE — design v2.1 complete and implementation-ready"  OR  new item(s)
New items:
- Normalize the design doc so `addPublisher` no longer contradicts B13 on `autoplay`.
- Make B17 explicit: “changed publisher” means `publisherClientId same but stream identity changed OR current live audio track id changed`, matching [remote-audio.service.ts:243-257](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:243).

STATUS: REVISE — v2.1 has no remaining in-scope silent-no-banner runtime path in Chrome, but the spec is not yet implementation-ready because B13 contradicts the top-level addPublisher text and B17’s change predicate is still ambiguous.

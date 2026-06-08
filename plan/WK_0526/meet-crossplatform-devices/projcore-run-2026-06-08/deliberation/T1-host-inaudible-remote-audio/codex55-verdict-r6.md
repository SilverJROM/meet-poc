# codex55 verdict — T1 round 6

## Q1 — B13-B16 each: correct&sufficient? (gaps file:line)

**B13 no-autoplay registry audio: correct and sufficient, with one implementation caveat.**

The current tile path has native `autoplay` on the per-peer audio element and calls `play()` before any service-owned sink/volume/mute ordering (`frontend/src/app/components/tile/tile.component.html:14`, `frontend/src/app/components/tile/tile.component.html:15`, `frontend/src/app/components/tile/tile.component.ts:56`, `frontend/src/app/components/tile/tile.component.ts:63`). Removing `autoplay` from the registry element is the right fix for A4 because it makes `el.play()` the only playback trigger, after `srcObject`, volume/mute, and `setSinkId`.

`srcObject` assignment itself should not start a fresh paused media element when there is no `autoplay` attribute and no prior `play()` call. The caveat is practical: do not reuse previously-played elements across publisher replacement. `addPublisher()` must create a fresh element or pause/null the old one first, otherwise assigning a new `srcObject` to an already-playing element can continue playback under the old sink/mute state.

**B14 reset-clearRegistry: necessary but not sufficient as written.**

The current `reset()` only calls `clearSources()` and then nulls mixer state (`frontend/src/app/services/remote-audio.service.ts:444`, `frontend/src/app/services/remote-audio.service.ts:446`); body-appended elements already exist today for kickstarts (`frontend/src/app/services/remote-audio.service.ts:552`, `frontend/src/app/services/remote-audio.service.ts:561`) and are destroyed only through source removal (`frontend/src/app/services/remote-audio.service.ts:568`, `frontend/src/app/services/remote-audio.service.ts:575`). So B14 is directionally correct.

But B14 does not fully close teardown races unless it also specifies an in-flight guard. The proposed registry `addPublisher()` has awaits for `setSinkId()` and `play()`. If `reset()/clearRegistry()` runs while `addPublisher()` is awaiting before the element is stored, reset cannot see that element. When the await resumes, stale code can append/store an element after teardown, recreating the exact leak B14 is meant to prevent. This is a real lifecycle path because room effects call `remoteAudio.syncPeers(this.peers())` reactively (`frontend/src/app/pages/room/room.page.ts:634`, `frontend/src/app/pages/room/room.page.ts:635`) while page lifecycle/cleanup can call teardown during state transitions (`frontend/src/app/pages/room/room.page.ts:2837`, `frontend/src/app/pages/room/room.page.ts:2844`).

Required B14 hardening: add a registry generation/session token. `clearRegistry()` increments the generation and synchronously pauses/nulls/removes every registered element. `addPublisher()` captures the generation, stores the entry before its first await, and after every awaited `setSinkId()` / `play()` checks that the captured generation and map entry still match before continuing. A stale continuation must pause/null/remove its local element and return without appending or marking playable.

**B15 volume migration: correct and sufficient.**

Current stored volume can be 1.3 because `MAX_VOLUME` is 1.3 and `setVolume()` persists the clamped value (`frontend/src/app/services/remote-audio.service.ts:47`, `frontend/src/app/services/remote-audio.service.ts:50`, `frontend/src/app/services/remote-audio.service.ts:200`, `frontend/src/app/services/remote-audio.service.ts:203`). `readStoredVolume()` currently returns parsed finite values directly (`frontend/src/app/services/remote-audio.service.ts:669`, `frontend/src/app/services/remote-audio.service.ts:674`). Migrating finite stored values to `min(parsed, 1)` and persisting the clamp is safe. First-run/no-stored-value remains `DEFAULT_VOLUME` (`frontend/src/app/services/remote-audio.service.ts:49`, `frontend/src/app/services/remote-audio.service.ts:672`) and does not need a special migration branch beyond avoiding `NaN`.

**B16 FIX-C payload: correct, but the proof condition must be explicit.**

Current diagnostics capture selected input devices but not selected output (`frontend/src/app/pages/room/room.page.ts:3498`, `frontend/src/app/pages/room/room.page.ts:3509`, `frontend/src/app/pages/room/room.page.ts:3510`), and `DiagnosticsPayload` has no remote playout state (`frontend/src/app/services/meeting-sessions.service.ts:345`, `frontend/src/app/services/meeting-sessions.service.ts:379`). Current inbound stats include `audioLevel` but not `totalAudioEnergy` or `totalSamplesDuration` (`frontend/src/app/services/meeting-sessions.service.ts:276`, `frontend/src/app/services/meeting-sessions.service.ts:289`; collection at `frontend/src/app/services/sfu-client.service.ts:728`, `frontend/src/app/services/sfu-client.service.ts:749`). B16 closes the observability gap if implemented as a first-class diagnostics payload and rendered on the diagnostics page, which today only renders SFU inbound tracks (`frontend/src/app/pages/diagnostics/diagnostics.page.html:179`, `frontend/src/app/pages/diagnostics/diagnostics.page.html:184`).

The single proof set is a tuple, not one scalar: for each publisher, `media-playout.totalAudioEnergy` or `totalSamplesDuration` increasing, `paused=false`, `muted=false`, `volume>0`, `srcObjectAttached=true`, `readyState >= HAVE_CURRENT_DATA`, and `sinkId === selectedAudioOutputId` (or `sinkMatchesSelected=true` if IDs are redacted). That proves browser-level decode/playout delivery to the selected sink. It cannot prove the OS/hardware actually emitted sound after the browser delivered to that sink.

## Q2 — contradiction check + the exact ordered addPublisher sequence

No core contradiction in B1-B16 if RemoteAudioService is the only owner of audible remote audio. Volume/mute being applied in `addPublisher()` and again in `setVolume()` / `setMutedAll()` is not double ownership; it is a snapshot-at-create plus state-change fanout. The source of truth remains service state (`mutedAll`, `volume`, `selectedSinkId`, `unlocked`), replacing the current mixer-only state (`frontend/src/app/services/remote-audio.service.ts:160`, `frontend/src/app/services/remote-audio.service.ts:162`, `frontend/src/app/services/remote-audio.service.ts:195`, `frontend/src/app/services/remote-audio.service.ts:200`).

The exact ordered `addPublisher(publisherClientId, stream)` sequence that satisfies B1+B3+B9+B13 and closes the B14 race is:

1. Derive the live audio track from `stream`; if none, call `removePublisher(publisherClientId)` and return.
2. If the existing registry entry for `publisherClientId` has the same stream and same live audio track, re-apply current state (`volume`, `mutedAll`, `selectedSinkId`) and return.
3. Call `removePublisher(publisherClientId)` to pause, null `srcObject`, remove DOM, and delete any old element.
4. Capture `const generation = registryGeneration`.
5. Create a fresh `HTMLAudioElement`; set `data-remote-audio` and publisher id; set `playsinline`; do **not** set `autoplay`.
6. Set `el.srcObject = stream`.
7. Apply atomic pre-play state synchronously: `el.volume = mutedAll ? 0 : Math.min(volume, 1)` and `el.muted = mutedAll`.
8. Store the registry entry immediately with `{ stream, track, el, generation, blocked: false }`, before the first await, so `clearRegistry()` can see and destroy it.
9. Append the element to `document.body` hidden/aria-hidden. This is safe because there is no autoplay attribute and `play()` has not run.
10. Await `setSinkId(selectedSinkId || '')` with default fallback.
11. After the await, if `generation !== registryGeneration` or the current map entry no longer points to this element, pause/null/remove the local element and return.
12. If `mutedAll` is true or `volume <= 0`, leave it registered and do not set the blocked banner just because the user intentionally muted speakers.
13. Call `el.play()` only after sink/volume/mute are applied.
14. On `play()` rejection, keep the entry registered, mark this publisher blocked, set `remoteAudioBlocked`, and leave global gesture recovery armed.
15. On success, mark unblocked and clear `remoteAudioBlocked` only if all registered unmuted publishers are playable.

This sequence also keeps B4 share dedup intact because the key is `peer.id` / publisher client id, not rendered tile instance. The room peer model uses client id as `PeerState.id` (`frontend/src/app/pages/room/room.page.ts:299`, `frontend/src/app/pages/room/room.page.ts:329`, `frontend/src/app/pages/room/room.page.ts:333`), while share layout can render the same peer twice (`frontend/src/app/pages/room/room.page.html:249`, `frontend/src/app/pages/room/room.page.html:272`).

## Q3 — silence-hunt table: [path | banner? | auto-recovery? | SILENT-NO-BANNER blocker?]

| path | banner? | auto-recovery? | SILENT-NO-BANNER blocker? |
|---|---:|---:|---:|
| Remote publisher is subscribed, inbound audio RTP/media-playout energy increases, registry element exists, but `play()` rejects due autoplay/user activation | yes, via blocked publisher | yes, global gesture recovery plus sticky unlock | no |
| Publisher joins before any host gesture | yes until click | yes after click | no |
| Publisher joins after host already unlocked audio | no, should play immediately | not needed; keepalive/watchdog can replay | no |
| Host goes background/freeze, elements become paused, then page becomes visible | should fire if still paused while publishers exist | visibility recovery calls `recoverRemoteAudio()` today (`frontend/src/app/pages/room/room.page.ts:2876`, `frontend/src/app/pages/room/room.page.ts:2879`); design v2 must keep per-element replay | no |
| Selected sink id is stale/unplugged and `setSinkId(selected)` rejects | no persistent silent banner if fallback succeeds; device dialog error on explicit change today (`frontend/src/app/pages/room/room.page.ts:1039`, `frontend/src/app/pages/room/room.page.ts:1042`) | yes, fallback to default and clear stored id (`frontend/src/app/services/remote-audio.service.ts:95`, `frontend/src/app/services/remote-audio.service.ts:106`, `frontend/src/app/services/remote-audio.service.ts:652`, `frontend/src/app/services/remote-audio.service.ts:654`) | no, if B16 logs selected/fallback sink |
| Selected sink id is unplugged, `setSinkId('')` fallback also fails | yes if registry marks sink failure as blocked | partial; devicechange/explicit fallback may retry (`frontend/src/app/pages/room/room.page.ts:2634`, `frontend/src/app/pages/room/room.page.ts:2640`) | no only if sink failure feeds `remoteAudioBlocked`; this must be part of B8 implementation |
| Browser lacks `setSinkId` support | no | default device only; not a recoverable selected-output route | no for app-selected-output proof if B16 records unsupported sink; user may need browser/default-device action |
| Bluetooth handoff changes physical output while browser keeps same sink id and element keeps playing | no reliable app banner | visibility/devicechange recovery may reapply sink, but cannot prove hardware speaker emitted | external silent path, not an app-detectable original-bug class; B16 must make browser delivery provable |
| OS-level exclusive-mode/device driver produces no audible sound despite browser element playing and media-playout energy increasing | no | none inside app | external silent path, not app-detectable; browser-level diagnostics should exonerate app |
| Host intentionally set meeting speakers muted-all | no | not appropriate | no, intentional state; B16 shows `muted=true` |
| Host set meeting speaker volume to 0 | no | not appropriate | no, intentional state; B16 shows `volume=0` |
| All remote publishers have mic muted or publish no audio track | no remote-audio banner | subscribe retry may not apply because there is no audio track to play | no; not remote playout failure |
| Publisher has an audio track but never produces decodable audio / remote mic capture is silent | no app playout banner if packets/energy do not prove voice | no playout recovery should fix publisher silence | no; diagnostics separates inbound bytes/audioLevel/energy from playout |
| SFU subscribe never produces `ontrack` for an advertised audio publisher | not a remote-audio-unblock banner | subscribe stuck watchdog/retry exists around no first frame (`frontend/src/app/services/sfu-client.service.ts:1512`, `frontend/src/app/services/sfu-client.service.ts:1518`; retry state at `frontend/src/app/services/sfu-client.service.ts:1100`, `frontend/src/app/services/sfu-client.service.ts:1135`) | no for playout banner, but diagnostics must show missing inbound/latency; this is receive failure, not original A4 |
| Mid mapping true live conflict overwrites a concurrent publisher | no banner if it suppresses a publisher before registry sees a stream | B5 must rollback/renegotiate, not permanent-stop (`frontend/src/app/services/sfu-client.service.ts:1724`, `frontend/src/app/services/sfu-client.service.ts:1753`) | no if B5 is implemented; yes if not |
| Registry element is leaked/recreated after reset by an in-flight `addPublisher()` continuation | can be silent/no-banner if stale element survives with old sink or wrong session | no, unless generation guard rejects stale continuation | **yes, new blocker under B14 as written** |
| Share layout renders the same peer twice | no | registry dedup by publisher id prevents double audible elements | no if service-owned registry replaces tile audio |
| Screen share plus camera stream from same publisher | no | registry keys audio by publisher client id and uses only the audio track from the voice stream, not screen stream | no if implemented as service registry |
| Body query `applySpeakerDevice()` applies sink to every `video,audio` later than registry `addPublisher()` | no | harmless extra apply if registry already applied selected sink; `LatestSinkIdApplier` coalesces per element (`frontend/src/app/services/remote-audio.service.ts:122`, `frontend/src/app/services/remote-audio.service.ts:148`) | no |

## Q4 — new item(s) OR "NO NEW ISSUE — design v2 complete"

**New issue B17: registry generation guard required for in-flight addPublisher/reset races.**

B14's cleanup ordering is necessary but incomplete. Because design v2 makes `addPublisher()` asynchronous, `clearRegistry()` must protect against stale continuations. Without a generation/session guard and "store before first await" ordering, reset can run during `setSinkId()` or `play()` and a stale continuation can append/register a dead publisher after teardown. That creates a silent-no-banner path in the same class as the original failure: the host can have remote media state that the app believes is recoverable/playing while the audible element is stale, wrong-sink, or detached from the current call lifecycle.

STATUS: REVISE — B14 needs an explicit registry generation/in-flight addPublisher guard; otherwise stale async registry continuations can recreate silent remote audio after reset with no banner.

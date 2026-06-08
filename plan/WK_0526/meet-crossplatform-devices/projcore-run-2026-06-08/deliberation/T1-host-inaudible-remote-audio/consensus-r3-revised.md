# T1 — REVISED fix design after R3 red-team (2026-06-08) — supersedes consensus.md fix section

Root cause is UNCHANGED (R2): host playout silently fails to deliver remote audio to the SELECTED output device — A4 (sink-routing on the single Web-Audio-mixed output element) + A3 (orphaned graph). The R3 red-team did NOT overturn the root cause; it broke the *fix plan* and surfaced 10 implementation blockers + 1 new bug (share echo). This file is the revised, red-teamed fix design that R4 must validate.

## Architecture decision (proposed, to be adversarially confirmed in R4)
**Option A — direct per-publisher `<audio srcObject=stream>` elements; NO AudioContext in the audible path.**
- Each remote publisher gets ONE unmuted `<audio data-remote-audio autoplay playsinline>` with `srcObject = publisher stream`.
- `setSinkId(selectedDevice)` applied per element BEFORE play() and again on device-change → reliable (direct-MediaStream element is the WebRTC-tested sink path) → **fixes A4**.
- No Web-Audio graph for playout → **A3 (orphaned graph) becomes structurally impossible**; A1/A2 (mixer gesture/autoplay) dissolved.
- Why A over B: Option B (per-element GainNode→MediaStreamDestination→`<audio>`) preserves volume>1 + limiter BUT plays a destination stream → re-introduces the exact setSinkId-on-Web-Audio-stream fragility = A4. Since A4 is the leading proven-by-elimination cause and Meet (which works on JROM's same device) uses direct elements, **Option A closes the most failure modes**. Cost: native volume caps at 1.0 (lose 1.3 boost) + no feedback limiter.

## The 10 R3 blockers → concrete fix requirements (all MUST be in the implementer brief)
| # | Blocker | Required fix |
|---|---------|--------------|
| B1 | volume + mute-all no-op on per-element path | `setVolume`/`setMutedAll` (remote-audio.service.ts:195-205) ALSO iterate `audio[data-remote-audio]` setting `el.volume = mutedAll?0:min(volume,1)`; tile audio effect reads volume()/mutedAll() reactively (tile.component.ts:56-67). State stays in RemoteAudioService. |
| B2 | feedback limiter lost | ACCEPT removal for Option A; document in changes.md; rationale = browser AEC + remote (not same-room) use; same-room is the only exposure. (If JROM later needs same-room, revisit.) |
| B3 | 130% boost impossible on native volume | Cap the volume UI to 100% (controls-bar) OR keep a per-element gain only if B chosen. For A: cap at 100%, note the change. |
| B4 | share-layout double audio (echo) — sharing peer rendered twice | Enforce EXACTLY ONE audible `<audio data-remote-audio>` per publisherClientId. In share layout, mute/omit the duplicate tile's audio (room.page.html:249/272 + strip). Add a guard/dedup keyed by peer id. |
| B5 | mid-guard must be reclaim-safe, not throw-only | On cross-publisher mid collision (sfu-client.service.ts:1753): if prior owner is stale/departed, CLEAR its mapping then set new; only on a TRUE live conflict, rollback + renegotiating re-subscribe (not permanent-stop). Never strand a publisher (north-star no-suppress). |
| B6 | recoverVoicePlayout no-op when mixer disabled (watchdog dies) | remote-audio.service.ts:351-353 early-returns on !mixerEnabled. Add a per-element recovery path: re-`play()` + re-`setSinkId` the `[data-remote-audio]` element for the stalled publisher. Keep the watchdog effective. |
| B7 | recoverPlayback !mixerEnabled early-return | remote-audio.service.ts:328-329 — add per-element `play()` attempts so keepalive + interaction-recovery re-play paused tile elements. |
| B8 | banner mixer-coupled (hasSources/outputPlaying) | room.page.ts:650-659 + recoverRemoteAudio:2685 — base `remoteAudioBlocked` on "remote peers with streams exist AND any per-element is paused/blocked", not mixer hasSources/outputPlaying. Per-element paused state is authoritative. |
| B9 | sinkId-before-play + apply-on-tile-mount race | Apply selected sink in the tile audio effect itself (before/at play), not only via the room device-change effect → no first-frames on default device. |
| B10 | don't delete RemoteAudioService | Keep a slimmed service: per-element unlock, sink routing helper, volume/mute STATE, watchdog hooks. Retire only the mixer GRAPH from the audible path. |

## Unchanged from consensus.md
- Anomaly B = SEQUENTIAL for this call; B5 guard is defensive. No talker-limiting (north-star directive).
- R3 diagnostics (media-playout audioLevel/totalAudioEnergy + contextState + per-element playout state) — UNCHANGED, still required (FIX-C). Now even more valuable: confirms on the next call whether Option A actually delivered to the selected device.
- Verifier ≠ fixer; rebuild live app for real US<->PH re-test.

## Open for R4 (adversarial)
1. Confirm Option A over B (or surface a reason B/another design is safer). 
2. Verify each B1-B10 has a concrete, correct fix (no hand-waving).
3. END-TO-END trace the REVISED design through a full call (join → 2 concurrent publishers → pick non-default output → volume → mute-all → screen-share → publisher leaves/rejoins → background/resume) and find where it still breaks.
4. Hunt for an 11th issue. If truly nothing new → first step toward the 3-clean streak.

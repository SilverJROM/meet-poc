# gpt54 CODE red-team CR6 (lens L6: spec-vs-code + observability)

## R1/R2/R3 trace

- **R1 — host hears every remote publisher on the selected output device:** **covered in code, partially tested, outcome GAP**
  - Code: `RemoteAudioService.addPublisher()` creates one service-owned `<audio>` per publisher, applies volume/mute/sink before `play()`, then keeps blocked state in the registry ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:429), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:479), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:596)). Room wiring drives this from live peers via `syncPeers(...)` and reapplies the selected speaker device in-call ([frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:635), [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2645)).
  - Test: `RA-REG-1` proves sink-before-play and no native `autoplay`; `RA-REG-4` proves sticky unlock for late publishers; `CR-FIX-3/4` prove fallback/unsupported sink reporting ([frontend/src/app/services/remote-audio.service.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.spec.ts:292), [frontend/src/app/services/remote-audio.service.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.spec.ts:359), [frontend/src/app/services/remote-audio.service.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.spec.ts:371), [frontend/src/app/services/remote-audio.service.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.spec.ts:395)).
  - Gap: no test proves the **outcome** "host hears remote audio" or even an end-to-end tuple of `inbound audio present + publisher row playing on selected sink`. Current tests stop at method order / state transitions.

- **R2 — host receives all concurrent publishers, never suppressed:** **covered in code, partially tested, outcome GAP**
  - Code: room subscribes every remote publisher after local publish; there is no active-speaker gating ([frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:683)). `syncPeers(...)` diffs **all** remote peers into the registry, keyed by `peer.id`, and preserves separate entries per publisher ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:256)). SFU mid-guard rejects live cross-publisher mid collisions and rolls state back instead of orphaning the existing publisher ([frontend/src/app/services/sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1740), [frontend/src/app/services/sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1769)).
  - Test: `IMPL-2` proves two publishers keep distinct mids and remote streams side by side ([frontend/src/app/services/sfu-client.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.spec.ts:1524)). `RA-REG-3` shows the registry can hold two publishers long enough to tear both down cleanly ([frontend/src/app/services/remote-audio.service.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.spec.ts:325)).
  - Gap: there is no test proving **two remote audio publishers are simultaneously playing/unpaused** in the registry, and no test proving host diagnostics see `>=2` concurrent inbound audio tracks with both active. This is still a spec-to-test hole.

- **R3 — diagnostics prove decode-vs-sink:** **partially covered, partially tested, GAP**
  - Code: `collectDiagnostics()` captures per-inbound-track `audioLevel`, `totalAudioEnergy`, and `concealedSamples`, plus call-wide `media-playout` stats ([frontend/src/app/services/sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:738), [frontend/src/app/services/sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:761)). Room payload includes `remoteAudioPlayout` with selected/effective sink state and per-publisher element state ([frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:3549), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:379)). Diagnostics UI renders per-publisher paused/muted/volume/sink/src/readyState plus inbound level/energy, and a call-wide media-playout row ([frontend/src/app/pages/diagnostics/diagnostics.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.ts:111), [frontend/src/app/pages/diagnostics/diagnostics.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.html:133)).
  - Test: `sfu-client.spec.ts` proves inbound `audioLevel`/`totalAudioEnergy` and `mediaPlayout` capture ([frontend/src/app/services/sfu-client.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.spec.ts:1185)). `diagnostics.page.spec.ts` proves per-publisher rows use publisher-specific inbound level/energy and distinguish selected-speaker fallback ([frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts:103), [frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts:197)).
  - Gap:
    - no test asserts `concealedSamples` is preserved into the user-visible diagnosis path;
    - no test asserts one row is sufficient to classify subscribe vs decode vs sink vs autoplay;
    - the rendered row drops some of the raw payload state needed for that classification (details below).

## B1-B22 spec-vs-code

- **B16 partial / diverged in the diagnostics surface.**
  - The payload type carries `selectedAudioOutputId`, `effectiveSinkId`, `usedFallback`, `unlocked`, and `blockedPeerIds` ([frontend/src/app/services/meeting-sessions.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/meeting-sessions.service.ts:353)).
  - The diagnostics page only renders per-publisher `paused/muted/volume/sink/srcObject/readyState/audioLevel/totalAudioEnergy` and the call-wide `mediaPlayout` row ([frontend/src/app/pages/diagnostics/diagnostics.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.ts:111), [frontend/src/app/pages/diagnostics/diagnostics.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.html:133)).
  - Result: the current row does **not** expose `unlocked`, `blockedPeerIds`, or a call-level selected/effective output summary even though the payload has them.

- **B20 partial.**
  - The service tracks fallback only as `usedFallback` plus `effectiveSinkId`; on a full sink failure, `updateSinkFallbackState()` exits early and leaves no explicit terminal sink result in diagnostics ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:534)).
  - Design wanted the sink application result to make wrong-device / device-unavailable cases explicit. The current payload does not carry `selected|default-fallback|unsupported|failed` as a first-class diagnostic field.

- **All other B-items appear present in the current code.**
  - B1/B3/B13: atomic pre-play, no boost, no native autoplay ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:433), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:542)); UI slider capped at `1.0` ([frontend/src/app/components/controls-bar/controls-bar.component.html](/home/agjrom/websites/meet-poc/frontend/src/app/components/controls-bar/controls-bar.component.html:160)).
  - B4/B17/B21: central registry, diff-driven wiring, track-identity replacement ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:256), [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:635)).
  - B5: live mid-conflict guard + rollback ([frontend/src/app/services/sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1740)).
  - B8/B12/B19: blocked banner, sticky unlock, replay/recover catch paths ([frontend/src/app/pages/room/room.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:228), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:282), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:493), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:559)).
  - B11: mixer retired from audible path; tiles no longer own remote audio ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:234), [frontend/src/app/components/tile/tile.component.html](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:1)).
  - B14/B15/B18/B22: registry teardown, volume migration, addPublisher sink timeout, mute-all visible control state ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:411), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:651), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:479), [frontend/src/app/components/controls-bar/controls-bar.component.html](/home/agjrom/websites/meet-poc/frontend/src/app/components/controls-bar/controls-bar.component.html:128)).

## Observability

**Answer: NO. One next-call row does not fully localize every remaining failure cause.**

What the current row can localize well:

- **not-subscribed**
  - Likely yes: missing publisher in `sfuDiagnostics.inboundTracks` and no matching registry row points here.
- **muted**
  - Yes: `muted yes` and/or `vol 0.00` on the per-publisher row.
- **played-to-wrong-sink**
  - Often yes: visible `default fallback` or non-selected sink label in the rendered row.
- **decoded-but-not-played**
  - Often yes: inbound `audioLevel/totalAudioEnergy` present while the publisher row is `paused yes`, `src attached`, or lands in `blockedPeerIds`.

Where the row is still ambiguous:

- **autoplay-blocked vs other play() failure**
  - The payload does not expose `playbackFailure` (`NotAllowedError` vs `AbortError` vs `NotSupportedError`) even though the service tracks it internally ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:501)).
  - The rendered row also omits `unlocked` and `blockedPeerIds`, which are the only coarse hints the payload currently has ([frontend/src/app/services/meeting-sessions.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/meeting-sessions.service.ts:357), [frontend/src/app/pages/diagnostics/diagnostics.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.html:133)).
  - Result: a single row can show "paused + no audible result", but not positively say "this was autoplay-blocked".

- **device-unavailable / sink-apply failed**
  - `default fallback` is visible when selected sink fails and default works.
  - But when **both** selected and default sink application fail, diagnostics do not carry a first-class sink result; `effectiveSinkId` is left null/stale because the service intentionally skips state updates on `failed` ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:534)).
  - Result: one row cannot positively distinguish `device-unavailable` from a generic blocked/paused playout state.

**The CR6 finding:** the missing first-class failure reason/result means one row still cannot reliably disambiguate `{autoplay-blocked | play() rejected for another reason | sink-apply failed/device unavailable}`. The code captures enough to narrow the blast radius, but not enough to end guesswork from a single row.

## NEW bugs

| Severity | Finding | Evidence |
|---|---|---|
| P1 | Single-row diagnostics are still insufficient to distinguish autoplay/playback failure from sink/device failure. `RemoteAudioPlayoutDiagnostics` omits a first-class `playbackFailure` / `sinkApplyResult`, and the page does not render `unlocked` or `blockedPeerIds`. | [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:379), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:501), [frontend/src/app/services/meeting-sessions.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/meeting-sessions.service.ts:353), [frontend/src/app/pages/diagnostics/diagnostics.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.html:133) |
| P2 | Recovery replays still await `setSinkId` without the addPublisher timeout. A hung sink route can still stall gesture recovery / keepalive / voice replay even though addPublisher itself is timeout-guarded. | [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:479), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:547) |

Verified locally:
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`
- `npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts`
- `npx tsx frontend/src/app/services/sfu-client.spec.ts`

STATUS: BUGS — one diagnostics row still cannot cleanly disambiguate sink/device failure from autoplay/playback failure

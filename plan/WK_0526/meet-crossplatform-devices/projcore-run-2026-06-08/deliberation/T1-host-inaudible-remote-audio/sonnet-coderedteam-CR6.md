# sonnet CODE red-team CR6 (lens L6: spec-vs-code + observability)

## R1/R2/R3 trace

### R1 — host hears every remote publisher's audio on the SELECTED output device
**Code:** `addPublisher` (remote-audio.service.ts:429-511) — creates element, sets `srcObject`, applies
volume/mute via `applyVolumeState`, awaits `setSinkId(selectedSinkId)` inside `withTimeout(..., 2000ms)`
(line 479), then awaits `el.play()` (line 494) — ALL before registering the element as unblocked. Registry
keyed by `publisherClientId` with `removePublisher(id)` called first (line 431) guaranteeing ONE element per
publisher at all times. `syncPeers` (line 256) wires ALL remote peers through `addPublisher`, driven by the
Angular effect at room.page.ts:634-637.

**Test proving outcome:** RA-REG-1 (remote-audio.service.spec.ts:292-302) — asserts `setSinkId:speaker-1`
precedes `play` in the element's call log and that no `autoplay` attribute is set. RA-REG-4 (line 359) —
asserts a late publisher gets `setSinkId:speaker-1` + `play` after sticky unlock without extra gesture.
CR-FIX-3 (line 371) — asserts `selectedAudioOutputId`, `effectiveSinkId`, and `usedFallback` are correctly
populated in diagnostics after a sink failure.

**Gap (accepted):** Tests use FakeAudioElement — they verify call ORDER and SEQUENCE, not that audio
physically exits the selected OS device. This is the acknowledged og-requirements.md limit ("real-device =
JROM final test"). B16 diagnostics close the remaining gap for live calls.

### R2 — host receives ALL concurrent publishers, never suppressed
**Code:** `syncPeers` (remote-audio.service.ts:256-279) — iterates ALL non-local peers, no active-speaker
gating, no suppression predicate. `addPublisher` creates an independent `<audio>` element per publisher.
`refreshBlockedState()` (line 596) aggregates across ALL registry entries.

**Test proving outcome:** CR-FIX-1 (spec line 498-516) — verifies two elements are active in sequence when a
track changes. RA-REG-6 (line 518) — verifies exactly ONE element per clientId (dedup). RA-REG-3 (line 325)
— adds two publishers (client-a + client-b), both show up in `elements[]`.

**Gap (minor, test-coverage only):** No test explicitly asserts `allSinksPlaying()` == true OR
`debugSnapshot().registryPeerIds.length === 2` while both publishers are simultaneously playing and neither is
paused or blocked. RA-REG-3 adds both publishers but pivots immediately to testing `reset()`. The code has no
suppression logic, so this is a test-coverage gap only, not a functional bug.

### R3 — diagnostics prove decode-vs-sink
**Code:**
- `playoutDiagnostics()` (remote-audio.service.ts:379-402) emits per-publisher: `paused`, `muted`, `volume`,
  `sinkId` (read from `el.sinkId` at capture time), `srcObjectAttached`, `readyState`, `trackName`, `trackId`.
  Service-wide: `selectedAudioOutputId`, `effectiveSinkId`, `usedFallback`, `unlocked`, `blockedPeerIds`.
- SFU `collectDiagnostics()` (sfu-client.service.ts:753-754) captures per-publisher `audioLevel` and
  `totalAudioEnergy` from `inbound-rtp` getStats and call-wide `media-playout` audioLevel/totalAudioEnergy/
  totalSamplesDuration (sfu-client.service.ts:769-774).
- `buildDiagnosticsPayload` (room.page.ts:3549) stores `remoteAudioPlayout` + `sfuDiagnostics` together.
- `buildRemoteAudioPlayoutRows` (diagnostics.page.ts:111-139) joins per-publisher playout state with SFU
  inbound-rtp stats at render time by `publisherClientId` + `trackName` (with fallback to clientId-only).
- Full row rendered (diagnostics.page.html:136-148): publisherLabel, paused, muted, volume, sink (redacted),
  srcObject, readyState, audioLevel, totalAudioEnergy.

**Test:** CR-FIX-3 (spec line 371-393) verifies the selectedAudioOutputId/effectiveSinkId/usedFallback triple
after sink failure and recovery. CR-FIX-2 (line 448-463) verifies trackName + trackId in per-publisher
diagnostics row.

**Gap:** No unit test verifying `media-playout` totalSamplesDuration population — this requires live
RTCPeerConnection getStats and is not unit-testable.

---

## B1-B22 spec-vs-code

All 22 items are present in the implemented code:

| # | Spec item | Code location | Status |
|---|-----------|---------------|--------|
| B1 | setVolume/setMutedAll iterate registry per-element | remote-audio.service.ts:238-254 | ✓ |
| B2 | No feedback limiter | feedback-limiter.spec.ts deleted; no limiter in service | ✓ |
| B3 | Cap at 100% — no >100% boost; slider max=1.0 | MAX_VOLUME=1 line 63; controls-bar.html line 162 `max="1"` | ✓ |
| B4 | ONE element per publisherClientId regardless of layout | removePublisher called first in addPublisher (line 431); test RA-REG-6 | ✓ |
| B5 | Mid-guard reclaim-safe — conflict throw + rollback | sfu-client.service.ts:1747-1758 throws on live-publisher mid conflict; rollback at 1769 | ✓ |
| B6 | recoverVoicePlayout per-publisher | remote-audio.service.ts:303, calls replayRegistryElements for peerId | ✓ |
| B7 | unlockAll = gesture recovery | unlockAndPlayRemoteSinks line 282; test RA-REG-4 | ✓ |
| B8 | Banner = remoteAudioBlocked signal from registry | refreshBlockedState line 596; room.page.ts:642 | ✓ |
| B9 | Atomic pre-play: setSinkId then play | lines 479→494; test RA-REG-1 | ✓ |
| B10 | Service kept, slimmed; no AudioContext graph | mixerEnabled()=false line 234; no AudioContext fields | ✓ |
| B11 | Mixer disabled; template bindings rewired | mixerEnabled()=false; no remoteAudioMixerEnabled in room.page.ts (grep confirms absent) | ✓ |
| B12 | Late-joiner sticky unlock | `unlocked` flag line 221; addPublisher always calls play(); test RA-REG-4 | ✓ |
| B13 | No autoplay attr on registry elements | addPublisher sets `playsinline` only (lines 434-435); test RA-REG-1 line 301 asserts `!attributes.has('autoplay=')` | ✓ |
| B14 | clearRegistry in reset — pause/null/remove before map.clear | reset() line 411 calls clearRegistry() line 413; clearRegistry calls removePublisher→destroyRegistryElement (lines 581-594); test RA-REG-3 | ✓ |
| B14-guard | Re-check isEntryCurrent after setSinkId AND after play | isEntryCurrent at line 488 (post-setSinkId) and line 495 (post-play) | ✓ |
| B15 | Volume migration: stored >1.0 clamped to 1.0; persisted | readStoredVolume + setVolume clamps (lines 651, 248); test RA-REG-7 | ✓ |
| B16 | RemoteAudioPlayoutDiagnostics type + payload + render | meeting-sessions.service.ts:353-370; room.page.ts:3549; diagnostics.page.ts:111-148; diagnostics.page.html:133-160 | ✓ |
| B17 | syncPeers wires addPublisher/removePublisher | remote-audio.service.ts:256-278; room.page.ts:636 | ✓ |
| B18 | setSinkId timeout → play anyway | withTimeout(applySinkId, 2000ms) line 479; 'timeout' path logs and falls through to play() | ✓ |
| B19 | Every play() call site has .catch | addPublisher lines 501-511; replayRegistryElements lines 564-570 — both have catch blocks setting entry.blocked | ✓ |
| B20 | Sink reject → default fallback; both fail → blocked | applyMediaElementSinkWithDefaultFallback line 129 tries '', returns 'failed' if both fail; entry.blocked=true on 'failed' (lines 483, 553) | ✓ |
| B21 | Diff predicate checks track identity, not just stream | syncPeers line 274: `current.stream === peer.stream && current.track === peer.track`; test CR-FIX-1 | ✓ |
| B22 | mute-all visible ON indicator | controls-bar.html: `[class.is-muted]`, `[class.muted]`, `[attr.aria-pressed]`, icon toggles volume-mute-outline↔volume-high-outline | ✓ |

**All 22 B-items present. No missing or diverged items.**

---

## Observability: can ONE next-call row localize the failure?

**Short answer: yes for 5 of 6 causes; one is invisible — but it's the catalogued-environmental case, not a
new gap.**

### Interpretation tuple per failure cause

| Failure cause | What the row shows | Visible? |
|---|---|---|
| not-subscribed | `perPublisher = []` (no registry entry); sfuDiagnostics.inboundTracks missing or bytesReceived=0 | ✓ visible |
| decoded-but-not-played (autoplay) | inbound `totalAudioEnergy` rising AND element `paused=true` + `blockedPeerIds` non-empty + `unlocked=false` | ✓ visible |
| played-to-wrong-sink | `usedFallback=true` OR element `sinkId` ≠ `selectedAudioOutputId`; `effectiveSinkId=''` means routed to default | ✓ visible |
| autoplay-blocked (gesture needed) | `paused=true` + `blockedPeerIds` non-empty + `unlocked=false` | ✓ visible (same as above, different context) |
| muted by host | `muted=true` OR `volume=0` in per-publisher row | ✓ visible |
| device-unavailable (setSinkId failed) | `usedFallback=true`; `effectiveSinkId=''` | ✓ visible |

### What is still invisible

**"setSinkId succeeded, element playing (paused=false, volume>0, muted=false), inbound energy rising, but OS
emits no sound."**

This happens when the selected output device passes setSinkId (device ID is valid and enumerable) and passes
getStats (`media-playout` totalAudioEnergy rising = audio reached the browser renderer), but the OS-level
audio stack silently drops the output — e.g., a Bluetooth headset that entered standby without OS
notification, an exclusive-mode device locked by another app, or a virtual audio device routing to a silent
sink. In this case the diagnostics row shows:
- `paused=false`, `muted=false`, `volume=1`, `sinkId=<selected-device-id>`, `usedFallback=false`
- `inbound totalAudioEnergy` rising
- `media-playout totalAudioEnergy` rising
- host still hears nothing

This is indistinguishable from "working correctly" in the captured data. **The design already catalogues this
as environmental:** "OS-exclusive-audio-device, background-tab OS throttle, undecodable/silent publisher
track — DETECTED by B16, no code fix" (consensus-r4-registry.md R6 note). No new finding here — the design
is correct that this is an OS-level opacity the browser does not expose.

### Secondary note: call-wide vs per-publisher

`media-playout` totalAudioEnergy (from getStats) is call-wide, not per-publisher. In a 2-publisher call where
JROM hears one but not the other, `media-playout` would still be rising (due to the audible publisher),
masking the silent one. The correct discriminator for per-publisher silence in that scenario is:
per-publisher `inbound totalAudioEnergy` rising (from sfuDiagnostics.inboundTracks) combined with per-element
`paused=false` — if both are true and JROM still can't hear that specific publisher, it narrows to the
OS-level invisible case above. The join between `remoteAudioPlayout.perPublisher` and
`sfuDiagnostics.inboundTracks` by `publisherClientId+trackName` in `buildRemoteAudioPlayoutRows` handles this
correctly.

### Verification of B16 media-playout without AudioContext

`media-playout` getStats is produced by the RTCRtpReceiver's internal playout pipeline, independent of any
Web Audio AudioContext. The SFU PC collects it at sfu-client.service.ts:768-774 directly from
`pc.getStats()`. No AudioContext is needed. ✓

---

## NEW bugs

None. All 22 spec items are in code. No new runtime paths found that prior lenses missed.

---

STATUS: CLEAN — requirements covered+tested (R1/R3 complete; R2 has a minor test-coverage gap for concurrent
outcome, not a functional bug), all B1-B22 present in code, diagnostics sufficient to localize every
in-scope silent failure; one invisible case is OS-level opacity already catalogued as environmental.

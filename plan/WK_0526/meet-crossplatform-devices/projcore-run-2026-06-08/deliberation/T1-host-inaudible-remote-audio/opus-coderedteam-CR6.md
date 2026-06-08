# opus CODE red-team CR6 (lens L6: spec-vs-code + observability)

## R1/R2/R3 trace
- **R1 (host hears every remote on the SELECTED device): COVERED + TESTED.** addPublisher applies setSinkId BEFORE play on a direct-stream element (remote-audio.service.ts:430+), registry per publisher, banner on paused/blocked. Tests assert sink-before-play ordering, no-autoplay, late-joiner plays, banner on paused. ✓
- **R2 (ALL concurrent publishers, never suppressed): COVERED in code; TEST GAP.** syncPeers adds every non-local peer with no active-speaker gating; mid-guard reclaim-safe; SFU layer has a 2-publisher coexistence test (sfu-client.spec). BUT there is NO registry-level test asserting that publisher A AND publisher B each hold a PLAYING/audible `<audio>` element SIMULTANEOUSLY. remote-audio.service.spec covers dedup (one-per-publisher), late-joiner, ERR9 sink-coalesce — not two-concurrent-audible. **This is the finding** (the headline requirement is the one without a direct outcome test at the registry level).
- **R3 (diagnostics prove decode-vs-sink): COVERED + TESTED.** playoutDiagnostics per-publisher = {publisherClientId, trackName, trackId, paused, muted, volume, sinkId, srcObjectAttached, readyState} + effectiveSinkId + usedFallback + blockedPeerIds; plus per-publisher inbound totalAudioEnergy + call-wide media-playout. Diagnostics spec covers shape. ✓

## B1-B22 spec-vs-code
All present (verified incrementally across CR1-5 + fixes): B11 mixerEnabled=false + registry-driven; B13 no-autoplay; B17 syncPeers-driven track-id diff; B1/B3 per-element vol/mute + cap; B8 banner registry-backed; B14 clearRegistry + disposed guard; B18 sink timeout; B19 play catch; B20/CR-fix sink-fallback honest (+ 'unsupported'); B5 mid-guard reclaim-safe; B16 diagnostics payload; B12 sticky-unlock; voiceStalled latch (CR-fix-1/2). No missing/diverged B-item found.

## Observability — can ONE next-call row localize the failure?
YES for all six IN-APP causes:
- not-subscribed → no perPublisher entry / inbound bytesReceived flat.
- decoded-but-not-played → inbound totalAudioEnergy rising AND element paused/voiceStalled.
- played-to-wrong-sink → element.sinkId != selected OR usedFallback/effectiveSinkId.
- autoplay-blocked → blocked + paused.
- muted → perPublisher.muted / mutedAll.
- device-unavailable → usedFallback / selectedSpeakerUnavailable / 'unsupported'.
Residual (documented, out-of-app): OS-exclusive device / background-throttle / physical-hardware → media-playout energy rises + sinkId=selected + not-paused yet host hears nothing = data correctly says "app delivered; cause is environmental." That's the boundary, not a gap (it RULES OUT the app, which is itself useful).

## NEW bugs
| severity | file:line | what | fix |
|---|---|---|---|
| LOW (test-coverage gap) | remote-audio.service.spec.ts | No registry-level test that TWO concurrent publishers each hold a playing element simultaneously (R2 outcome). | Add a spec: addPublisher(A)+addPublisher(B) → both registry entries present, both not-paused/not-blocked, both volume/mute correct; remove one → other still audible. |

STATUS: BUGS — code delivers R1/R2/R3 and observability is sufficient, but the R2 "two-concurrent-audible" outcome lacks a registry-level test (the headline requirement's direct test is missing). Add that test (CR-fix-5), then re-run L6. Everything else CLEAN.

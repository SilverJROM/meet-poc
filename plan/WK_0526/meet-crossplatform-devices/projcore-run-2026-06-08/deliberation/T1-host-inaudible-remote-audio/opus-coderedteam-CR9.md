# opus CODE red-team CR9 (lens L9: privacy/perf/closure)

## Privacy/security of payload
Diagnostics are stored in `meeting_session_diagnostics` keyed by `owner_email` and read owner-only (established schema + the project's owner-only diagnostics rule / egress-IP gating). The NEW fields are the HOST's OWN device/SFU identifiers: selectedAudioOutputId + per-publisher sinkId (the host's output device), trackId (browser MediaStreamTrack id — ephemeral, non-PII), trackName + advertised-publisher clientIds (SFU/CF identifiers, not PII), usedFallback/blockedReason (state flags). No cross-participant PII (a participant's payload does not contain ANOTHER participant's IP/device). Manifest = SFU clientIds/trackNames, same trust domain as existing roster data. No new privacy leak found. (Payload is bounded by participant count, small per row.)

## Perf-at-scale (5-10 publishers)
All O(n) in publisher count: syncPeers diff (linear), applyOutputDevice Promise.all over registry (linear), playoutDiagnostics map (linear), refreshBlockedState some() (linear). querySelectorAll('audio[data-remote-audio]') on recovery is one DOM scan (not per-peer-nested). No O(n^2); element/timer count is one element + listeners per publisher, removed on leave. Fine at 5-10; would be fine well beyond.

## FINAL closure — the EXACT JROM scenario
Scenario: host (PH) with a NON-DEFAULT speaker selected; 2 US publishers (Windows+ext-mic, Android) send clean audio RTP; original symptom = host received RTP but heard NEITHER, NO banner.
Current code walk:
- Each publisher → its OWN `<audio data-remote-audio srcObject=publisherStream>` (no shared mixer, no AudioContext).
- addPublisher applies volume/mute then `setSinkId(selectedDevice)` BEFORE play() — setSinkId on a DIRECT-MediaStream element is the reliable WebRTC path (fixes A4, the original root cause). Both publishers play on the SELECTED device → host HEARS BOTH concurrently (R2, no gating).
- If the selected device's setSinkId fails → default-fallback (AUDIBLE) + usedFallback/selectedSpeakerUnavailable honest state.
- If decoded-but-not-emitted (sink stall) → voiceStalled latches the banner (no more silent-no-banner).
- If autoplay-blocked → banner + gesture/interaction recovery.
- Diagnostics localize any residual cause per-publisher.
→ The EXACT original symptom (received-but-silent, no banner, non-default speaker) is CLOSED. No residual path to it found in the current code. Remaining non-app residual (OS-exclusive device / background-throttle / dead hardware) is documented + detectable (energy rises + sinkId=selected ⇒ app delivered; cause is environmental).

## NEW bugs
None. tsc=0, specs pass, ng build green (last verified).

STATUS: CLEAN — payload owner-gated/no-new-PII, O(n) at scale, and the EXACT JROM scenario resolves to "host hears both on the selected device with honest diagnostics + banner on any failure". Vote toward streak (lens L9).

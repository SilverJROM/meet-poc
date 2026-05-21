# DR-45 Changes

User Report verbatim:
> HIGH (callers use iPad/iPhone): DR-34 gives each remote peer its own <audio> element, but iOS/Safari limits playing MULTIPLE simultaneous audio elements — with 3-5 remotes a phone may only play ONE remote (others silent); plus iOS autoplay needs a gesture and the app has scattered AudioContexts. Fix two parts: (1) CENTRAL UNLOCK: on the first qualifying user gesture at join/admit, resume ALL AudioContexts + .play() every remote audio element; sticky "tap to enable audio" prompt until ALL remote sinks play; re-arm if a later remote fails. (2) iOS-SAFE multi-remote: ensure all remotes (≤4, cap=5) are audible on iOS.

Root Cause mechanism:
- DR-34 correctly decoupled audio from video by giving every remote tile its own hidden `<audio>`, but that leaves iOS with N simultaneous media elements.
- iOS autoplay also requires play/resume work to be tied to a user gesture. The previous unlock path only retried per-peer elements and left AudioContext owners scattered.
- Remote peer streams can keep the same `MediaStream` object while the underlying audio track changes, so a mixer must compare and rewire the actual track, not only peer IDs.

Implemented:
- Added `RemoteAudioService`, an iOS-gated shared Web Audio mixer: one `AudioContext`, one `MediaStreamAudioSourceNode` per remote audio track, one shared `GainNode`, one `MediaStreamDestination`, and one hidden output `<audio data-remote-audio-mixer>`.
- Added track-aware peer sync. A peer source is removed and recreated when the peer is added, removed, its stream changes, or its selected audio track changes/ends.
- Centralized unlock through `unlockAudioFromGesture()` on Join, Admit, and the enable-audio prompt. It resumes active speaker, activates/resumes mic preview when a local track exists, resumes the remote mixer, applies selected speaker output, and plays all remote sinks.
- Made the audio unblock prompt sticky by removing the dismiss-only action; it clears only when all expected remote sinks are playable.
- Kept non-iOS on the existing DR-34 per-peer tile `<audio>` path.

Per-file WHY:
- `frontend/src/app/services/remote-audio.service.ts`: owns the iOS mixer graph, sink routing, unlock/play checks, and source lifecycle.
- `frontend/src/app/pages/room/room.page.ts`: wires central unlock gesture points, syncs remote peers into the mixer, exposes debug evidence, and cleans the mixer on leave/reset.
- `frontend/src/app/pages/room/room.page.html`: adds the single iOS mixer output and disables tile audio only when the iOS mixer is enabled.
- `frontend/src/app/components/tile/tile.component.*`: preserves DR-34 by default while allowing room-level suppression of per-peer audio elements on iOS.
- `e2e/tests/v3-ios-audio/ios-audio.spec.ts`: verifies iOS shared mixer behavior and track-replacement rewiring.

Autonomous decisions: none beyond the approved plan and required rewire reinforcement.

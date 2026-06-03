# B1 Changes — Host Audio Recovery

## User Report
> "i cant hear the user again, can you check if she can hear me? as well and please do this autonomously with codex to fix it go"
> "log to ovm and finish this ok"

## Root Cause
Host received guest RTP, but `jitterBufferEmittedCount` stayed flat at 0. The mixer path routed remote tracks through `AudioContext.createMediaStreamSource`, while per-tile `<audio>` playback is disabled in mixer mode. That means Chrome had no muted, playing HTMLAudioElement attached to the same remote `MediaStream`, matching the Chromium #121673 workaround cited in north-star: WebRTC remote streams feeding Web Audio need a muted playing media element to kickstart playout.

The prior recovery also relied too heavily on the dedicated "Enable audio" banner after a suspended/idle context. In host-alone then late-join timing, the host may not tap the banner before leaving.

## Per-File Why
- `frontend/src/app/services/remote-audio.service.ts`: owns per-source hidden muted kickstart audio elements, lifecycle cleanup, source-add recovery, replay of kickstart/output elements, sink routing, and a silent keepalive node inside the existing graph.
- `frontend/src/app/pages/room/room.page.ts`: wires automatic in-call recovery on context/source changes, visibility return, periodic keepalive, and any global in-call user interaction with a self-removing listener that re-arms when the context is non-running.
- `e2e/tests/b1-host-audio/host-audio.spec.ts`: proves the missed path by asserting muted playing kickstart elements and suspended-context recovery via interaction/source-add.

## Scope Guard
No SFU subscribe/transport, capture, diagnostics schema, tile non-mixer behavior, layout, device picker, B2 limiter params, or mic-join-gate changes.

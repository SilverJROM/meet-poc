# JROM disambiguating evidence (2026-06-08, during/after deliberation round 1)

Direct answers from the host (JROM) about the failing call. These NARROW the root cause hard —
round-2 packets must weight these heavily.

1. **NO audio-blocked / tap-to-enable banner ever appeared** on the host screen. He just heard silence.
   → If the AudioContext were `suspended` WITH sources, the `remoteAudioBlocked` banner SHOULD have
     fired (room.page.ts:650-658). It did not. So EITHER the context was `running` (autoplay is NOT
     the visible failure) and audio died downstream (output element / sinkId), OR the banner logic
     itself failed to detect the silent state. Pure-autoplay-suspend is DEMOTED.

2. **Host speaker/volume looked normal AND other apps' audio worked at that time.**
   → OS output device is ALIVE and audible. Not a hardware/OS/default-device failure. The failure is
     specific to OUR app's delivery of remote audio to that working output.

3. **Host had SELECTED A SPECIFIC OUTPUT DEVICE** in the app (not default).
   → Directly implicates the sinkId routing path: `applyMediaElementSinkWithDefaultFallback` /
     `LatestSinkIdApplier.apply` (remote-audio.service.ts:85-156, 652) applied to the SINGLE shared
     mixer output element (the only audible element; kickstarts are muted). If setSinkId routes the
     mixer-destination stream to a device that doesn't actually emit (or the persisted id is stale /
     from another machine and the '' fallback lands on a non-audible default), host hears nothing
     while OS/other apps (using the real default) work.

4. **They switched to Google Meet with the SAME devices and it worked immediately.**
   → Confirms hardware + selected device + network are fine. "the problem is our app" (JROM verbatim).
     A working reference (Meet) routed remote audio to the same selected output device successfully.

## Implication for round 2 (focus the panel here)
PRIMARY suspect is now the **remote-audio OUTPUT/SINK path on the single shared mixer element**, NOT
autoplay-suspend. Specifically interrogate:
- Does `setSinkId` actually work on an `<audio>` element whose `srcObject` is a Web-Audio
  `MediaStreamAudioDestinationNode.stream`? (Known cross-browser weakness — Web-Audio output routing
  may ignore setSinkId and/or go to default; with a non-default selected device this can be silent.)
- Is the selected output deviceId valid on THIS host, and does the fallback chain ever land on a
  truly audible endpoint? Trace `selectedAudioOutputId()` → room.page.ts:2667 → applySinkId.
- Could the single mixer-output approach itself be the defect — i.e., should remote audio play through
  per-publisher UNMUTED `<audio>` elements (like Meet) rather than one Web-Audio-mixed element whose
  setSinkId routing is unreliable?
- Re-confirm: was AudioContext actually `running`? If yes, autoplay is out and this is purely output/sink.
- Anomaly B (one-publisher-at-a-time) still to be settled, but it is secondary to the all-silent output.

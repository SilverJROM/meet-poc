# DR-46 Review

PASS.

- The fix addresses the mechanism directly: local track end/persistent mute now reacquires media and replaces existing RTP sender tracks instead of requiring refresh.
- Recovery is bounded: three attempts with backoff, then a stable no-device state.
- Audio recovery preserves the existing DR-13 sender preference path by using `replaceLocalSenderTrack('audio', nextTrack)`.
- Video recovery uses `replaceLocalSenderTrack('video', nextTrack)` for fallback and `replaceVideoTrack(null)` when no camera remains, avoiding a dead video sender.
- Selected device persistence only happens after a replacement track exists.
- The old "refresh to rejoin" default is removed.
- No admit, identity, reconnect, PC recreate, or renegotiation code was changed.

Residual risk: browser/device behavior around real OS hot-unplug can vary; Playwright covers the app-level track events and fallback decisions with fake devices.

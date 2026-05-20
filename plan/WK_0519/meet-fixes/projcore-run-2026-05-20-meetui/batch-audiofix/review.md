# Batch audiofix review

Diff review:
- PASS: remote audio sink is rendered for remote peers only and is outside `showVideo()`.
- PASS: remote audio binds to the live `peer.stream`, not a snapshot `new MediaStream(getAudioTracks())`.
- PASS: visible `<video>` is muted for all peers and also force-muted in the attach effect.
- PASS: room-level autoplay prompt retries all `audio[data-remote-audio]` elements on user gesture.
- PASS: `setSinkId` still targets `video, audio`, and the selected output device is reapplied after peer render changes.
- PASS: local self-view does not render a dedicated audio element.

Out-of-scope checks:
- No media capture/send-side code changed.
- No DR-29 device selection behavior changed.
- No mirror, reconnect, or negotiation code changed.

Residual risk:
Browser autoplay policies can still require a user gesture. The prompt now persists and retries playback when that happens.

# Batch audiofix independent validation

Requirement: DR-34 remote audio must play independent of video/camera state, handle autoplay rejection, preserve output routing, and keep local self-view muted.

Validation result: PASS.

Evidence:
- Dedicated remote audio element is rendered for `!peer().isLocal` and does not depend on `showVideo()`.
- Remote audio `srcObject` is the live `peer.stream` object that WebRTC mutates via `ontrack`.
- Visible video is muted for all peers, preventing double-audio when a remote camera is on.
- Autoplay rejection is caught and escalated to a persistent room-level "Tap to enable audio" prompt.
- Prompt user gesture retries every remote audio sink.
- Existing `setSinkId` routing still covers `audio` elements and is refreshed for newly rendered peer audio nodes.
- Focused Playwright test passes on isolated 48xx ports with `/tmp/meet-poc-audiofix.sqlite`.
- pm2 restart completed and environment check showed no test DB or recordings env leak.

Requirement closure:
DR-34 is satisfied for the primary root cause: camera-off/avatar remote peers retain a live, playing audio sink independent of the video element.

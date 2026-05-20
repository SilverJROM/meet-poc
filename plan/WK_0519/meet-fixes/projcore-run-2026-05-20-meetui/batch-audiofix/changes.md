# Batch audiofix changes

User Report verbatim:
> "i had a call with a person on the PH as well last night and he was unable to hear and we cant hear him as well similar to the US incident, he was using a pc with a external mic/camera. so this is not an isolated us incident"

Root Cause mechanism:
`tile.component.html` rendered the only media playback element behind `showVideo()`. Remote `peer.stream` carries audio and video, but when the peer camera is off, missing, or fails, the `<video>` is removed and replaced by the avatar. That leaves the remote audio track attached to no playing element. Chrome autoplay rejection was also previously ignored because the code only assigned `srcObject` and never caught `play()`.

Files changed:
- `frontend/src/app/components/tile/tile.component.html`: added always-rendered remote-only hidden `<audio autoplay playsinline>` outside the `showVideo()` block; changed visible video to always muted.
- `frontend/src/app/components/tile/tile.component.ts`: binds the remote audio element to the live `peer.stream` object, calls `play()`, emits autoplay-blocked events on rejection, and explicitly mutes every video element.
- `frontend/src/app/components/tile/tile.component.scss`: hides the remote audio sink without removing it from the DOM.
- `frontend/src/app/pages/room/room.page.html`: wires tile autoplay-blocked events and renders a persistent "Tap to enable audio" prompt.
- `frontend/src/app/pages/room/room.page.ts`: retries all remote audio sinks on user gesture and reapplies selected output routing to newly rendered audio nodes.
- `frontend/src/app/pages/room/room.page.scss`: styles the unblock prompt.
- `e2e/tests/v3-audiofix/audiofix.spec.ts`: adds the DR-34 two-peer regression.

Scope guard:
No send-side capture, DR-29 external mic behavior, mirror behavior, reconnect logic, or WebRTC negotiation behavior was changed.

Autonomous decisions: none.

Caveats:
The focused regression starts with a negotiated camera track, then toggles camera off/on. A no-video-at-join peer later enabling camera appears to require negotiation work, which is explicitly outside DR-34.

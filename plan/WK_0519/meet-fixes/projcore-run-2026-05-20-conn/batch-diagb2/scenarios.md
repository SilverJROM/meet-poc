# DIAGB2 Scenarios

## DR-1 Screen-Share Helper
- Given an in-call desktop user and `getDisplayMedia()` fails with a browser/system permission denial, show an in-app helper explaining macOS Screen Recording permission and the Cmd+Q Chrome restart requirement.
- Non-permission display-media failures keep the normal screen-share failure status text.

## DR-2 Diagnostics + Force Relay
- Given a two-peer call, the diagnostics control opens a visible panel listing each remote peer with `connectionState`, `iceConnectionState`, `iceGatheringState`, `signalingState`, and selected candidate type.
- Force relay is default OFF. With OFF, peer connections are created with the existing `{ iceServers }` config shape.
- When force relay is toggled ON, the setting persists to `localStorage` and remote peer connections are recreated with `iceTransportPolicy: 'relay'`.

## DR-3 WebSocket Reconnect
- Given an admitted owner in a call, closing the signaling socket reconnects with backoff, resends join, clears stale remote/local peer state, and stays in-call.
- Given an admitted guest in a call, closing the signaling socket reconnects with a short-lived admission token and resumes the call instead of going back to knocking.
- Given an unadmitted guest with no valid token, the backend still requires knocking.

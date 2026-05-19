# FIX-B1 Decision — Signaling Buffer, Drain Trigger, and UA Gate

## Decision

Buffer early inbound WebRTC `signal` messages in `RoomPage` until the sender's peer connection exists, then drain immediately after `webrtc.addPeer()` creates that connection.

## Buffer Size

Each sender is capped at 20 queued messages.

Rationale: a normal offer/answer exchange plus ICE candidates should stay well below this count in the small-room POC. The cap prevents a malformed or hostile peer from growing memory without bound while still leaving enough space for a burst of ICE candidates before `peer-joined` is processed.

## Drain Trigger

Drain is triggered after peer creation in both admission paths:

- Existing peers from the `admitted` message.
- New peers from the `peer-joined` message.

Rationale: the lost-signal bug only exists before the PC is created. Draining immediately after creation preserves the normal `WebrtcService.handleSignal()` path and avoids broader signaling refactors.

## Cleanup

Queued messages are cleared when a peer leaves and during full call cleanup.

## Background Pause Gate

Background video pause now requires both:

- `viewport.isMobile()`
- `platform.isMobileUA()`

Rationale: viewport width alone caused narrow desktop windows to behave like mobile tabs. The new gate keeps the mobile/iOS protection while preventing false desktop camera pauses.

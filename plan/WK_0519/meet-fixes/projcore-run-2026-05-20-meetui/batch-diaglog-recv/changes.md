# DR-33 Inbound Audio Diagnostics Changes

## User Report

JROM's US bug is the receive-side failure: "I can't hear HIM." DR-28 already persisted send-side diagnostics, but the log did not show whether the remote peer's audio packets were arriving at this client.

## Root Cause Mechanism

The diagnostics payload recorded connection state, candidate type, quality, and outbound sender track info. `readQualityMetrics()` read inbound RTP stats for combined audio+video quality, but no audio-only receive stats or receiver-track state were copied into `DiagnosticsPeerSample`. A one-way-audio failure could therefore look like a generic quality/candidate issue instead of showing "remote audio packets are not arriving."

## Changes

- Added `DiagnosticsInboundAudio` and `DiagnosticsPeerSample.inboundAudio`.
- Captured audio-only `inbound-rtp` stats where `type === 'inbound-rtp'`, `!isRemote`, and `kind === 'audio'`.
- Added a separate `previousInboundAudioPackets` counter for audio receive deltas. The existing combined `previousStats` packet-loss and quality calculation remains unchanged.
- Captured matching audio `RTCRtpReceiver.track` `readyState` and `muted`.
- Persisted the new field through the existing diagnostics JSON payload path. No migration was needed because the backend stores `payload_json`.
- Added "Audio recv" to `/app/diagnostics`, with an obvious green "arriving" or red "not arriving" status.
- Added Playwright coverage proving a two-party fake-device call persists `packetsReceived > 0`, `packetsReceivedDelta > 0`, and `packetsActivelyArriving === true` for the remote peer.

## Autonomous Decisions

None.

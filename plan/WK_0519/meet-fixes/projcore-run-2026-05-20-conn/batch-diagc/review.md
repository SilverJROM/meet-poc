# Batch DIAGC Review

## Requirement Check
- DR-11(a): PASS. `webrtc.service.ts` polls `getStats()` and records quality/loss/jitter/RTT/bitrate per peer.
- DR-11(b): PASS. Sustained poor quality marks the receiver audio-only and sends `receiver-video-policy` over the existing signal relay; sustained good restores.
- DR-11(c): PASS. Manual audio-only toggle pauses video and blocks auto-restore until turned off.
- DR-11(d): PASS. Remote tiles show a quality/audio-only pill and diagnostics expose metrics.
- DR-11(e): PASS. Audio sender priority is high, video sender priority is lower with maxBitrate cap, guarded by `setParameters` fallback handling.

## Risk Notes
- `RTCRtpSender` priority/networkPriority support is browser-dependent; unsupported senders are caught and logged at debug level without breaking calls.
- Auto receiver degrade intentionally does not pause the local outbound video unless manual mode is on or the remote peer requested it. The asymmetric-downlink fix is the `receiver-video-policy` signal to the sending peer.
- Audio senders are not paused or replaced by the degrade path.

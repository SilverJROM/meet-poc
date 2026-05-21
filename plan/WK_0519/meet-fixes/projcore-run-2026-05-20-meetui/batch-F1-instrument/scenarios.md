# Batch F1 Instrument Scenarios

## User Report
Batch-F1: Outbound-RTP video + audio jitter-buffer instrumentation + fix screenshare-expected (DR-54)

The real call (session 841202a0) proved video receives zero frames both ways while audio works, but diagnostics could not tell whether video bytes ever left the sender. Diagnostics also lacked audio jitter-buffer stats, transceiver/renegotiation observability, and screen sharing was not treated as expected inbound video.

## Scenarios
- DR-54-S1: Per-peer diagnostics samples expose outbound video RTP counters, sender encoding parameters, sender track identity, and an actively-sending flag derived from framesSent deltas.
- DR-54-S2: Per-peer diagnostics samples extend inbound video with bytes/packets/loss/dropped/keyframe/jitter-buffer/NACK/PLI/FIR fields while preserving existing freeze/no-media labels.
- DR-54-S3: Per-peer diagnostics samples extend inbound audio with jitter-buffer delay/target/emitted, concealment counters, and remote inbound audio RTT/fractionLost when available.
- DR-54-S4: Per-peer diagnostics samples include transceiver mid/direction/currentDirection and sender/receiver track states.
- DR-54-S5: negotiationneeded forensics records whether that event itself sent an offer, observe-only, without changing negotiation behavior.
- DR-54-S6: A remote peer with screenOn=true and camEnabled=false is treated as expected inbound video unless existing audio-only/pause exclusions apply.
- DR-54-S7: Diagnostics page surfaces outbound video sending, frames encoded, quality limitation reason, and inbound audio jitter-buffer delay.

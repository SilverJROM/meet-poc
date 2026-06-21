# B0 Test Report — Local 2-client mutual audio

**Run:** batch-0  
**Verdict:** ✅ PASS (local mutual audio check green)

## Evidence
- DEV health + proxy: 200
- Throwaway room created: 3073e6a60221 (recorded; kept for B1)
- Distinct signals: tone-440.wav (host) + tone-880.wav (guest) via --use-file-for-fake-audio-capture
- Join path: executed per guardrail #1 live inspection (see changes.md)
- Admit: used `.knock-toast` + role Admit (exact from rendered DOM dump)
- 2 clients reached in-call (2 tiles)
- Measurement (shared util):
  - host measures guest: energyAboveFloorMs=5120, inboundBytesDelta=329, pass=true
  - guest measures host: energyAboveFloorMs=5120, inboundBytesDelta=405, pass=true
- Screenshots: b0-2-tile-in-call*.png
- Metrics JSON: b0-mutual-metrics.json (in batch-0/metrics/)

## Dual-criteria (measurement standard)
- WebAudio Analyser RMS/energy above floor for >=3s (actually ~5.1s)
- RTCPeerConnection inbound-rtp audio bytesReceived strictly increasing (deltas 329/405)

All on rendered app (no API shortcut).

## Scope adherence
- Only R1 + reusable rig
- No TEST_ROOM01 touched
- No prod deploy
- Secrets read at runtime only
- Clean (no TODO, deferrals OFF)

**Next:** room id 3073e6a60221 ready for B1 remote join.

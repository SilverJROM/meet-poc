# Batch video-weak Changes

User Report verbatim:
> video showed for NEITHER user because the DR-11 auto-degrade dropped video to audio-only too aggressively on the weak/flapping link. Fix: on a weak/poor link, FIRST keep video alive at a LOWER quality ... Only FULLY go audio-only at a true floor where keeping video would actually threaten audio.

Root Cause mechanism:
DR-11 treated sustained `poor` samples as immediate `auto-poor` audio-only. That path added the peer to `autoPausedReceivers` and sent `videoPaused: true`, so the remote sender stopped video and the receiver tile had no flowing low-bitrate video to render.

Per-file WHY:
- `frontend/src/app/services/webrtc.service.ts`: added an intermediate receiver-requested degraded-video policy (`videoDegraded`) before the existing paused policy. Degraded video keeps sender video active at 120000 bps, scale 4, 8 fps, with audio high priority unchanged. The audio-only auto-poor path now requires a conservative critical floor.
- `frontend/src/app/pages/room/room.page.ts`: widened the debug test hook and sender snapshot type so e2e can assert degraded encoding and the critical-floor transition.
- `e2e/tests/v3-diagc-weak-connection/diagc-weak-connection.spec.ts`: updated DR-11 weak-link coverage for DR-42: poor degrades but still renders video; critical floor pauses; recovery restores; manual audio-only still wins.
- `e2e/tests/v3-diagd-join-audio-invariant/diagd-join-audio-invariant.spec.ts`: preserved the DR-13 invariant while accepting degraded video encoding at the weak tier.

Autonomous decisions: none. The tier thresholds and encodings were operator-approved before implementation.

Caveats:
- The floor is intentionally conservative: it requires sustained poor samples plus a critical signal such as failed/disconnected ICE/PC state, no inbound media, >=35% loss, RTT >=1500 ms, jitter >=250 ms, or available outgoing bitrate below 90 kbps.

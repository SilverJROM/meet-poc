# DR-47 Changes

User Report verbatim:
NEXT BATCH — video-freeze (DR-47). Gap: a connection can read 'connected' while media is dead — video frozen (frames stop) or no inbound media — and we don't detect it. Implement inbound video-freeze detection, connected-but-no-media detection, recovery through existing DR-40 ladder, and DR-43 diagnostics labels/fields. Never confuse intentional video-off with freeze.

Root Cause mechanism:
The quality sampler tracked aggregate packets and inbound audio, but not inbound video frame progress. A peer could remain `connected` while `framesDecoded`/`framesReceived` stopped or while both audio packets and video frames stayed at zero. Because DR-40 only reacted to disconnected/failed ICE states, connected-but-media-dead peers had no recovery trigger or diagnostic label.

Files changed:
- `frontend/src/app/services/webrtc.service.ts`: added inbound video stat sampling, sustained media-dead counters, expected-video gating, DR-40 media-dead trigger support, and diagnostic labels.
- `frontend/src/app/services/meeting-sessions.service.ts`: added `DiagnosticsInboundVideo` and peer diagnostic label fields.
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts/html`: displayed video receive status, frame/freeze counters, and labels.
- `frontend/src/app/pages/room/room.page.ts`: added `sender-silent` and `autoplay-blocked` labels into persisted diagnostics payloads.
- `e2e/tests/v3-video-freeze/video-freeze.spec.ts`: added focused DR-47 coverage for frozen video, no inbound media, and camera-off exclusion.

Autonomous decisions: none.

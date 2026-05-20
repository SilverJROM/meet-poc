# Batch DIAGC Changes

## Scope
- Branch: `fix/meet-conn-diag`
- Requirement: DR-11 voice-first weak-connection resilience plus DR-11(e) audio-priority bandwidth allocation.

## Files Changed
- `frontend/src/app/services/webrtc.service.ts`
- `frontend/src/app/pages/room/room.page.{ts,html,scss}`
- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html,scss}`
- `frontend/src/app/components/tile/tile.component.{html,scss}`
- `frontend/src/app/services/active-speaker.service.ts`
- `e2e/tests/v3-diagc-weak-connection/diagc-weak-connection.spec.ts`

## What Changed
- Added per-peer quality metrics from `getStats()` with delta packet loss, jitter, RTT, available outbound bitrate, and good/weak/poor classification.
- Added 3-poor auto-degrade and 5-good restore hysteresis.
- Added `receiver-video-policy` control payload through the existing opaque signal relay so weak receivers can ask senders to pause video sent to them.
- Added manual audio-only mode; manual mode wins over auto-restore.
- Added always-on sender bandwidth preferences: audio priority/networkPriority high; video lower priority with a 700 kbps maxBitrate cap.
- Added weak-connection banner, per-peer quality pill, expanded diagnostics, and localhost debug hooks for validation.

## Self-Verification
- PASS: `npm run build -w frontend`
- PASS: `npm run build -w backend`
- PASS: `E2E_BACKEND_PORT=4722 E2E_FRONTEND_PORT=4713 E2E_PROXY_PORT=4712 E2E_BASE_URL=http://localhost:4712 E2E_WS_ORIGIN=ws://localhost:4712 npm test -w e2e -- tests/v3-diagc-weak-connection --config=playwright.config.ts --workers=1`

## Caveats
- Browser E2E uses a localhost debug seam to feed poor/good samples into the same hysteresis and signaling path; production sampling still reads `RTCPeerConnection.getStats()`.

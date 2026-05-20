# Decision: DIAGC Quality Test Seam

## Decision
Use a localhost `__meetDebug.sampleConnectionQualityForTest(quality)` hook for E2E quality injection.

## Reason
Playwright/Chromium did not reliably allow overriding native `RTCPeerConnection.getStats()` on constructed peer connections. The hook feeds the same production hysteresis, video-policy signaling, UI, and sender-parameter path after the `getStats()` parser.

## Constraint
Production behavior still polls real `RTCPeerConnection.getStats()`; the hook is exposed only through the existing debug object used by local E2E tests.

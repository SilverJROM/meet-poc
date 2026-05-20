# Batch DIAGI Review

## Findings
- No blocking code-review issues found within the freeze-limited validation scope.

## Checks
- Picker-selected camera sends exact `deviceId` and does not also send mobile `facingMode`.
- Mobile flip clears the pinned camera selection before requesting `facingMode`.
- Lobby preflight now honors stored or selected device IDs.
- In-call mic swap continues through `replaceLocalSenderTrack('audio', ...)`, so DR-13 sender parameters are reasserted.
- The default non-picker path remains browser default or mobile `facingMode`, avoiding stale exact camera IDs after flip.

## Residual Risk
- Playwright and live-device proof are deferred by freeze. JROM real hardware remains the final proof for actual multi-cam/mobile front-back switching.


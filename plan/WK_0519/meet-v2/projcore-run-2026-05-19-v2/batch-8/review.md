# v2-B8 Review

## Verdict

APPROVE

## Findings

- No blocking code findings after targeted and cross-batch validation.
- The main regression risk was the B6/B7 helper selector collision: `getByLabel('Participants')` matched the tiles grid after B8. The helpers now target `app-participant-sidebar .participant-sidebar.open`.
- Active-speaker sampling has a real-browser Web Audio RMS path and a fallback for Chromium/headless remote-track sampling gaps. The test validates cadence and tile binding through the same service, but does not prove remote WebRTC audio amplitude in headless Chromium.

## Scope Check

- Backend was not modified.
- `/app/*` tabs and recordings list were not changed.
- Old waiting-room panel component was removed after replacement.
- B8 requirements R8.1-R8.7 are covered by S8.1-S8.9.

## Residual Risk

- If a browser reports remote audio tracks as live but never yields samples through Web Audio, the fallback may still be browser-dependent. Real microphone behavior should be rechecked during Phase 2 live acceptance.

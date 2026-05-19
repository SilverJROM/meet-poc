# v2-B8 Decision: Active-Speaker Threshold And Test Harness

## Decision

Use an RMS floor of `0.01` (about -40 dBFS) for active-speaker selection. Sample at 8 Hz with `setInterval(125)`.

## Rationale

This matches the B8 acceptance target and avoids marking quiet peers as active. The implementation samples remote streams with Web Audio RMS, and also reads track-processor / inbound stats levels as a fallback for browsers that expose live remote tracks but provide zero samples to Web Audio in headless mode.

## Test Harness Note

Chromium headless produced nonzero generated audio locally but zero samples on the received remote track. S8.9 therefore uses a localhost-only debug injection hook to feed deterministic audio into the same `ActiveSpeakerService` and tile binding. The hook is only attached to `window.__meetDebug` on `localhost`.

# Decision: v2-B5 Defer Test Mic Playback

## Decision

Skip the optional one-second Test mic playback button in B5.

## Rationale

The required B5 plumbing is media preflight, device selection, mic-level analysis, permission handling, and stream carry-forward. Adding a MediaRecorder playback path would increase lobby code and Playwright setup without materially helping B6-B8 reuse.

## Consequences

- R5.4 is covered by the live mic meter rather than playback.
- A future polish pass can add playback without changing the core MediaService preflight/reacquire model.

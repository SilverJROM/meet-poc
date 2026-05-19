# Decision — B5 Audio Validation Threshold

## Status

Accepted

## Decision

Use `ffprobe` plus a 1000-byte minimum file size for S5.3.

## Rationale

`ffprobe` verifying an Opus audio stream is the strongest practical binary-level proof in this stack. The 1000-byte size floor catches empty MediaRecorder blobs while avoiding false failures from Opus/container size variation in fake-media Chromium.

## Consequences

- S5.3 fails if there is no audio stream.
- S5.3 does not attempt source separation; it verifies the mixed recorder output contains real audio.

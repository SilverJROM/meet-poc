# Decision — B5 AudioContext Defaults

## Status

Accepted

## Decision

Use the browser's default `AudioContext` sample rate and destination stream settings.

## Rationale

The legacy PoC used default `AudioContext` construction. For a browser-local voice recording mix, forcing a sample rate adds compatibility risk without improving acceptance proof.

## Consequences

- Browser chooses the sample rate.
- MediaRecorder writes Opus WebM from the destination stream.

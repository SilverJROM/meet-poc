# Decision: B7 Mid-Call Device Loss Detection

## Context

Browser behavior for revoking microphone permission or unplugging a device can vary. B7 needs a reasonable in-call notice without rebuilding media recovery.

## Decision

Attach handlers to the local audio track:

- `onmute`
- `onended`

When either fires during `in-call`, set local mic state false, broadcast `media-state`, and show a non-blocking notice.

## Rationale

These track events are the browser-provided signals available without polling. A full device-recovery loop is outside B7.

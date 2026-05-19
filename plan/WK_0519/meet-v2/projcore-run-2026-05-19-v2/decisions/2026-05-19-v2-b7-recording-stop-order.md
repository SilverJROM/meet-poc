# Decision: B7 Recording Stop Order

## Context

The recording banner should disappear for everyone promptly when the host stops recording, while upload may continue for a short time.

## Decision

On Stop:

1. Stop local `MediaRecorder`.
2. Send `{type:'recording-state', state:'stopped'}`.
3. Upload the blob.

## Rationale

The user-visible recording state should reflect capture state, not upload state. Upload progress remains in the call status text.

## Consequences

If upload fails after stopping, the banner still correctly disappears because recording has stopped.

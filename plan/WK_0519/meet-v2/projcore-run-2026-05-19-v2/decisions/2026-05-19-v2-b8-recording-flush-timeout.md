# v2-B8 Decision: Recording Flush Timeout

## Decision

Use an 8 second timeout for recorder stop and an 8 second timeout for upload during End meeting for everyone.

## Rationale

The host browser owns the `MediaRecorder`, so the server cannot safely finalize a partial recording after the host ends the meeting. Waiting up to 8 seconds gives normal local blobs time to stop and upload while preventing the host from being stuck in the dialog indefinitely.

## Accepted Trade-Off

If the host tab closes during the flush, a partial blob can be lost. This is accepted by R8.5.

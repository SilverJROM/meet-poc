# B2 Voice Watchdog Thresholds

Date: 2026-06-03

## Decision

Use a 1.5s watchdog poll and a four-sample rolling detector window. Treat receiving-but-silent as `bytesReceived` increasing over the window while `jitterBufferEmittedCount` remains flat. Cap remediation at four attempts per peer window, matching the four-step ladder: resume, kickstart, replay, rebuild.

## Why

- 1.5s is inside the required 1-2s sample interval.
- Four samples give roughly 4.5s of confirmation before firing, reducing false positives from transient stat timing.
- `bytesReceived <= 0 delta` is legitimate silence/no inbound media and must be a hard no-op.
- `mutedAll === true` is intentional local silence and must be a hard no-op.
- `emitted` climbing is the desired outcome and resets the peer window/attempts to prevent thrash.

## Counterfactual

A shorter two-sample window would react faster but risks firing on transient stat jitter. A longer window would delay recovery in the exact late-join silent playout case.

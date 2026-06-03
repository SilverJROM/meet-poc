# Decision — B1 Kickstart + Keepalive

## Decision
Keep kickstart audio elements service-owned rather than template-owned.

## Why
The mixer disables per-tile audio, so the service is the only owner that reliably sees every mixed remote source. Creating the hidden muted element beside `addSource()` lets the #121673 workaround share the exact source lifecycle: create with the source, replay during recovery, and remove on source removal/reset.

## Keepalive Choice
The service adds a silent oscillator into the mixer destination graph and the room page periodically calls playback recovery while in-call. This keeps the graph warm through host-alone idle periods where possible, while still respecting autoplay failures by re-arming global in-call interaction recovery and preserving the banner as last resort.

## Rejected
Template changes to re-enable tile audio in mixer mode were rejected because they risk double audio and would alter the non-mixer tile path guarded by the batch scope.

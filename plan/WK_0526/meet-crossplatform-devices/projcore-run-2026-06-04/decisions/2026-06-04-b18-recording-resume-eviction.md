# Decision - B18 Recording Resume And Eviction

## Decision
Use two narrow mechanisms:
- Resume a suspended recorder `AudioContext` before constructing/starting `MediaRecorder`, but log and continue if resume rejects.
- Evict stale recorder sources by comparing a snapshot of recorder-tracked ids to the current live remote peer ids.

## Rationale
Mobile browsers commonly create audio contexts in `suspended` state until a user gesture unlocks them. Recording start is host-gesture initiated, so awaiting `resume()` before recorder construction/start gives the mixer the best chance to produce audible output. If resume rejects, proceeding still gives the user a recording attempt instead of a hard failure.

The room effect must compare two different sets: what the recorder currently tracks and what peers are currently live. Iterating a copied `recordedClientIds()` array avoids mutating the same map while walking its keys. The recorder's local source is keyed as `local`, so the room-level stale-remote eviction preserves that key.

## Alternatives Not Taken
- Throwing on resume rejection: rejected because it can turn a degraded recording into no recording.
- Reusing the live peer list for eviction: rejected because dropped peers are absent from that list, which was the original dead-loop bug.

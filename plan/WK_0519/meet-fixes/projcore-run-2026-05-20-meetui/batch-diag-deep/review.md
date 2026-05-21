# DR-43 Review

## Scope Check

- DR-43 only: capture, persist, and display diagnostics for connection forensics.
- DR-41 behavior remains in place and unchanged.
- Existing ICE restart behavior was not expanded; this slice only records audit fields around the existing path.
- No new high-frequency polling was added.

## Implementation Review

- Candidate-pair details are read from `RTCPeerConnection.getStats()` using `transport.selectedCandidatePairId` where available, with candidate-pair fallback.
- Relay-gathered-per-side is recorded from local/remote ICE candidates and stats candidate reports.
- Timelines and WS cycles are ring-buffer style bounded arrays, preventing long calls from growing memory or payloads unbounded.
- Full forensic JSON stays inside the existing diagnostics payload persisted by `payload_json`; backend schema did not need a migration.
- Compact display is intentionally summarized in `/app/diagnostics`; full detail is left in Download JSON.

## Residual Risk

- Browser stats support differs by engine. If a field is unavailable, the payload keeps the forensic structure but individual candidate-pair values can be `null`.
- Some short calls may capture timelines before a selected candidate pair is available; later interval/state-change samples fill it when stats expose the pair.

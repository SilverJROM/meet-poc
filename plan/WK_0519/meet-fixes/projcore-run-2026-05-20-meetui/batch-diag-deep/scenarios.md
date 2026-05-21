# DR-43 Scenarios

## Covered

- DR-43.1: A diagnostics sample includes per-peer candidate-pair forensic fields: selected pair object, candidate-pair count, nominated-pair change count, local/remote candidate type and protocol when available.
- DR-43.2: A diagnostics sample includes ICE gathering state and relay-gathered-per-side booleans.
- DR-43.3: A diagnostics sample includes ICE restart audit fields: fired, attempts, outcome, time-to-recover, terminalFailed, and `autoRecoveryOutcome: null`.
- DR-43.4: A diagnostics sample includes signaling/negotiation forensics: signaling transitions, negotiationneeded count, makingOffer, ignoreOffer/glare, and rollback counter.
- DR-43.5: A diagnostics sample includes a bounded transition timeline for connection, ICE connection, signaling, gathering, candidate pair, negotiation, and restart events.
- DR-43.6: A diagnostics sample includes WS signaling health and a bounded disconnect-to-reconnect cycle log.
- DR-43.7: `/app/diagnostics` shows compact key forensics, and Download JSON preserves the full payload.

## Out of Scope

- DR-40 auto-recovery behavior.
- DR-42 video changes.
- Any call/admit/identity policy change.

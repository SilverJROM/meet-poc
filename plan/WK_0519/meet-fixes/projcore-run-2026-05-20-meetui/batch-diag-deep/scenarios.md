# DR-41 Scenarios

## Covered in this slice

- DR-41.1: A two-peer call produces persisted diagnostics from the owner and from an admitted guest.
- DR-41.2: Diagnostics POST rejects a client that was never admitted to the session.
- DR-41.3: Owner-gated diagnostics viewing remains unchanged.
- DR-41.4: Diagnostics logging defaults ON and can be disabled via a localStorage-backed UI toggle.
- DR-41.5: When logging is OFF, interval, beacon, and queued/manual diagnostics posts stop.

## Out of scope

- DR-43 deep forensics.
- DR-40 recovery behavior.
- DR-42 video changes.
- Call/admit/identity behavior changes beyond read-only membership validation for diagnostics POST.

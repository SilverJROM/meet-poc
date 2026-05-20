# DIAGE2 Review

## Findings

- No blocking findings after implementation and verification.

## Checks

- Closed waiters are held outside `pending`, so they do not appear in the host waiting list and do not trigger the DR-10 doorbell.
- Host open promotes existing closed waiters into the normal pending/admit flow and cancels their timers.
- Host close only changes the room setting for future joins; it does not remove admitted peers.
- Owner auto-admit and DIAGF guest resume paths remain before the closed-room gate.
- The legacy `knocking` payload shape remains unchanged.
- Validation used inline environment variables only; no shell exports were left behind.

## Residual Risk

The room list wait-timeout input accepts fractional values for testability and uses a minute label. Product may later want a more constrained picker for normal users, but DR-16 specifically needed sub-minute backend tests and a host-set per-room timeout.

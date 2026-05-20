# DIAGE2 Decision: Closed Waiters Outside Pending

## Decision

Closed-room guests are tracked as `closedWaiters`, separate from the existing `pending` knocker list.

## Rationale

DR-16 requires closed-room guests to see a timed wait without appearing as normal knockers. Keeping them out of `pending` prevents host waiting-list pollution and avoids triggering the DR-10 doorbell. When the host opens the room, the backend promotes the waiters into `pending`, sends a waiting-room state update, and then reuses the normal knock/admit flow.

## Compatibility

The existing `knocking` payload remains unchanged. The new wire messages are additive:

- `waiting-room`
- `waiting-timeout`

Older clients that ignore the new messages will not crash, and existing knock/admit clients retain the legacy message shape once a room is open.

## Environment Hygiene

Validation used inline `MEET_DB_PATH` values only. No environment variables were exported into the shell. The full Run-1 gate used the default recordings directory because a legacy recording assertion checks `recordings/` directly.

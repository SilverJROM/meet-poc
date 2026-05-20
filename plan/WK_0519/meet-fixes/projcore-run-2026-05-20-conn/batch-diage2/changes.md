# DIAGE2 Changes

## User Report

DR-16: add a host-controlled Open/Close room toggle and waiting room. Default room state is closed. Closed rooms show guests a timed wait; open rooms use the normal admit flow without a timeout.

## Root Cause / Mechanism

Before this batch, all fresh guest joins went straight into the pending knocker list. There was no room-level access state, no host-controlled open/closed setting, and no timed closed-room wait. DR-16 needs an access gate before the existing pending/admit state, while preserving owner bypass and DIAGF reconnect resume.

## Backend Changes

- Added migration `0006_room_access.sql` with `rooms.is_open` default `0` and `rooms.wait_timeout_minutes` default `15`.
- Extended room store/API responses with `isOpen` and `waitTimeoutMinutes`.
- Added owner-gated `PUT /api/rooms/:id/access`.
- Added signaling closed-waiter state:
  - closed fresh guests are tracked separately from `pending`;
  - timeout sends `waiting-timeout` and closes the socket;
  - reconnect creates a new waiter/timer;
  - host open promotes waiters into `pending`, sends `waiting-room isOpen=true`, and then uses the normal knock/admit flow.
- Kept owner and valid DIAGF resume admission paths ahead of the closed-room gate.

## Frontend Changes

- Added room list Open/Close control and wait-timeout input for owners.
- Added closed waiting-room UI with countdown.
- Changed open-room pending copy to "The host is available - please wait to be admitted."
- Preserved legacy `knocking` wire shape by deriving open-room copy from room access state instead of adding fields to that message.

## Test Changes

- Added backend DR-16 tests for defaults, owner-gated access updates, closed timeout, reconnect timer restart, owner bypass, open flow, and host-open mid-wait promotion.
- Updated legacy backend signaling/session tests to explicitly open rooms when they exercise the old pending/admit flow.
- Updated e2e fixtures to open test-created rooms explicitly so pre-DR-16 tests keep using the normal admit flow.
- Added DIAGE2 Playwright coverage and screenshots.

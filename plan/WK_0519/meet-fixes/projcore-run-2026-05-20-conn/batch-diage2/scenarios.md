# DIAGE2 Scenarios

Scope: DR-16.

## Closed Room

- New rooms default to closed.
- A fresh guest joining a closed room receives a closed-room waiting state, not a pending knock.
- The guest sees "This room hasn't been opened by the host yet" with a countdown.
- The closed waiter is not placed in the host pending list and does not ring the doorbell while the room remains closed.
- On timeout, the guest receives a clear timeout message and is disconnected.
- Reconnecting to a closed room starts a fresh timer.

## Host Opens Mid-Wait

- If the host opens the room while a guest is in the timed wait, the server cancels the kick timer.
- The waiting guest receives a state update and moves into the open pending/admit flow.
- The host receives the normal knock once the guest becomes pending.

## Open Room

- A guest joining an open room enters the existing knock/admit flow with no timeout.
- The waiting copy says "The host is available - please wait to be admitted."
- The host admits the guest using the existing pending-list controls.

## Owner And Existing Participants

- The owner bypasses the waiting-room gate even when the room is closed.
- DIAGF resume paths bypass the waiting-room gate.
- Closing a room affects new joins only; admitted peers are not ejected.

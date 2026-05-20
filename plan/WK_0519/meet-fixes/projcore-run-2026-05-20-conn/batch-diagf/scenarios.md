# DIAGF Scenarios

Scope: DR-18, DR-19, DR-21, DR-22.

## DR-18 Silent Resume

- A previously admitted guest that loses the signaling socket resumes with the stored reconnect token.
- The host is not asked to admit the guest again.
- The resumed guest lands back in the call.
- The server rejects attempts to claim another peer slot without the valid, unexpired reconnect token scoped to that room, session, and user.

## DR-19 No Ghost Tiles

- A transient socket close broadcasts `peer-reconnecting`, not `peer-left`.
- Existing remote tiles stay present during the grace period and show recovering state.
- On successful resume, peers receive `peer-resumed` with `{ oldClientId, clientId, name, host }`.
- The frontend reconciles the old peer identity to the new client id instead of rendering a second tile.
- Explicit leave/remove still emits immediate removal and does not use reconnect grace.

## DR-21 Owner Auto-Admit On Reconnect

- An owner whose socket drops resumes by authenticated owner identity.
- Owner resume does not require a reconnect token.
- Owner resume is still scoped to the same room and protected by matching owner email.
- Fresh unrelated clients cannot use an old owner client id to become admitted.

## DR-22 Disconnect Grace

- ICE `disconnected`/`failed` enters a recovering state for about 20 seconds before teardown-quality escalation.
- The peer tile and existing remote audio stream remain attached during the recovering window.
- Recovery clears the timer and returns the peer to connected/good state.
- Mobile visibility/background pauses do not call full call cleanup; explicit page unload/leave remains explicit.

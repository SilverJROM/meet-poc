# Batch STABILITY Scenarios

## User Report
JROM: "she gets dropped on my call and I get dropped on hers, and I need to RESTART THE ROOM to resume."

## Scenarios

1. Terminal peer failure after ICE restart exhaustion recreates the RTCPeerConnection, reuses the same DR-37 participantId, renegotiates, preserves DR-13 audio priority, and keeps the DR-34 remote audio sink bound.
2. PC recreate yields to the DR-31/DR-37 reconnect/resume path when a peer is already marked reconnecting, so recovery mechanisms do not double-fire.
3. Negotiation deadlock in `have-local-offer` rolls back and re-offers, recording DR-43 rollback diagnostics.
4. WebSocket drop reconnects, resends join with the existing clientKey/reconnect token, resyncs room state, and does not create a waiting-room re-admit.
5. DR-37 identity test reflects the later DR-39 contract: a drop keeps one reconnecting/resumed tile and auto-admits by clientKey, not a new manual admit.

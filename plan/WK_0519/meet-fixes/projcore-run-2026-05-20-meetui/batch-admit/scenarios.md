# Batch Admit Scenarios

## User Report
DR-39 + DR-38: admitted clients must not be forced through the waiting room after drops, refreshes, reloads, tab closes, crashes, or bare WebSocket closes. Only the explicit Exit/Leave button may send a `leave` message, remove the card immediately, and revoke membership so the next join requires owner re-admit.

## Scenarios
- DR-39 drop after admit: an admitted `clientKey` reconnecting after a transport drop or after reconnect grace expires is admitted immediately, reuses the durable participant identity, and does not knock.
- DR-38 explicit leave: clicking the Leave/Exit button sends `{ type: 'leave' }`, the server removes the card immediately, and the same `clientKey` must knock on its next join.
- DR-38 close semantics: a WebSocket close by itself, including legacy close code/reason values, is a drop and never revokes membership.
- Re-admit clears revoke: after an explicit leave, if the owner admits the returning `clientKey`, later drops resume seamlessly again.
- Unknown client keys and normal first-time guests still use the waiting room.

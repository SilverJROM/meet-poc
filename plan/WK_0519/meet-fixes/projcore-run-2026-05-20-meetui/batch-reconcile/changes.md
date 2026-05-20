# DR-31 Reconcile Changes

- Backend signaling now assigns a server-issued `participantId` to each admitted participant and preserves it across reconnect tickets and grace records.
- Reconnect tokens are registered when issued, not only after the old socket closes, so guest reconnects can validate before the stale socket close handler runs.
- Owner and guest reconnects supersede an old admitted or reconnecting socket for the same identity and broadcast `peer-resumed` with `oldClientId`, `clientId`, and `participantId` instead of `peer-joined`.
- Frontend peers carry `participantId`; tile rendering tracks by participant identity and shows `Reconnecting…` on the existing tile during server reconnect grace.
- Frontend dedup removes only the explicit superseded `oldClientId` from `peer-resumed` or stale/dead peers for the same participant identity. Live peers for the same identity are not torn down by a plain join.
- Resumed peer connections are recreated through the normal `addPeer` path, so DR-13 sender preferences are reapplied: audio high priority, video low priority and capped when a video sender exists.
- Existing cap tests were updated to fill rooms with distinct guest identities instead of repeated owner sockets, matching the new one-owner-identity invariant.

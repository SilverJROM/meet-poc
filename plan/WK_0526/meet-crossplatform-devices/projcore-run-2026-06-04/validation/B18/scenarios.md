# B18 Scenarios

## REC1 - Suspended AudioContext Resume
- Given recording starts while the created recorder `AudioContext` is `suspended`
- When `RecorderService.start()` runs
- Then `ctx.resume()` is called and awaited before `MediaRecorder` is constructed or started
- And recording still proceeds after the resume gate completes.

## REC2 - Dropped Peer Recorder Eviction
- Given the recorder is tracking `local`, an active remote peer, and a dropped remote peer
- When the room recorder sync sees only the active remote peer in the live peer list
- Then eviction iterates the recorder-tracked id snapshot
- And the dropped peer source is disconnected and removed
- And `sourceCount` reflects local plus active remote only.

## REC3 - Peer Resumed Recorder Rekey
- Given a peer reconnects with `oldClientId` -> `newClientId`
- When the `peer-resumed` handler runs
- Then the recorder is notified that `oldClientId` left before the new participant is joined
- And the next recorder sync captures the new peer stream under `newClientId`
- And no old recorder source remains.

## Device Seat Note
Unit/build proof verifies the mechanisms. Real mobile audible recording and real drop/reconnect-during-recording confirmation remains JROM's iOS/Android/browser seat.

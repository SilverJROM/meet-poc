# DR-45 Scenarios

## TS-DR45-01 Central audio unlock
- Given a caller taps Join or a host taps Admit
- When the app handles that gesture
- Then active speaker audio, mic preview audio, and remote sinks are unlocked from the same gesture path
- And the enable-audio prompt remains visible until all remote sinks are playable

## TS-DR45-02 iOS shared remote mixer
- Given the local browser is detected as iOS/Safari
- When remote peers join with audio tracks
- Then the room uses one shared remote audio output instead of per-peer audio elements
- And each remote peer contributes one audio source node into that shared output
- And selected speaker output routing is applied to the shared output element when `setSinkId` exists

## TS-DR45-03 Mixer rewire
- Given an iOS caller has a remote peer in the mixer
- When that peer's remote audio track is replaced by reconnect, peer resume, PC recreate, or another stream/track update
- Then the old mixer source is disconnected
- And the peer is rewired to a source node for the new live audio track

## TS-DR45-04 Non-iOS and video policy invariants
- Given the local browser is not iOS
- When remote peers join or camera/video suppression changes
- Then DR-34 per-peer remote audio elements remain in use
- And audio remains keyed from remote audio tracks, not camera/video visibility.

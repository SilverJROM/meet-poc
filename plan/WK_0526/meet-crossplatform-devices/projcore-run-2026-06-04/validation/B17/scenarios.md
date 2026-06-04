# B17 Scenarios

## Scope
Stop resource leaks across long/repeated calls for LEAK2, LEAK3, LEAK4, and LEAK5 only.

## Scenarios

1. LEAK2 recorder reconnect source replacement
   - Given a recorder audio source exists for `peer-1`
   - When `peer-1` is added again with a replacement stream
   - Then the old `MediaStreamAudioSourceNode` is disconnected before the replacement is retained
   - And `sourceCount` stays at 1 for that peer.

2. LEAK3 active-speaker peer analyser dedupe
   - Given active-speaker analysis exists for `peer-1`
   - When `peer-1` is added again with a replacement stream
   - Then the old source/analyser/sink graph is disconnected
   - And `analyzerCount` remains 1 for that peer
   - And removal disconnects the retained replacement graph.

3. LEAK4 SFU subscribe retry backoff cleanup
   - Given subscribe retry backoff timers are pending
   - When each teardown path that clears subscribe stuck watchdogs runs
   - Then all subscribe backoff timers are clearTimeout'd and the tracked set is empty
   - And no retry-version bump can occur from a timer after cleanup.

4. LEAK5 media debug track registry pruning
   - Given a debug track is registered
   - When the track ends
   - Then `window.__activeTracks` drops it
   - And registering a later stream does not retain the old ended track.


# DR-47 Scenarios

## TS-DR47-01 video-frozen
- Given a remote peer is connected/completed and camera video is expected.
- When inbound-rtp video `framesDecoded`/`framesReceived` stop advancing for 3 quality samples while audio still advances.
- Then the peer is labeled `video-frozen`, DR-43 includes `framesDecoded` and `freezeCount`, and DR-40 ICE restart is scheduled.

## TS-DR47-02 no-inbound-media
- Given a remote peer is connected/completed and camera video is expected.
- When inbound audio packets and inbound video frames both stay at zero for 3 quality samples.
- Then the peer is labeled `no-inbound-media`, DR-43 includes inbound frame/audio counters, and DR-40 ICE restart is scheduled.

## TS-DR47-03 intentional video-off excluded
- Given a connected remote peer intentionally has camera off.
- When inbound video frames and audio packets are zero.
- Then no `video-frozen` or `no-inbound-media` label is set and media-dead recovery is not scheduled.

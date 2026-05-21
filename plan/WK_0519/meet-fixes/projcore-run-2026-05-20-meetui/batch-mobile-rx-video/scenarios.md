# Batch mobile-rx-video Scenarios

## DR-51

1. A desktop sender is connected 1:1 to a mobile receiver.
2. The server propagates the mobile receiver's `isMobile: true` presence to the sender.
3. The sender keeps audio active/high priority and applies the degraded video tier toward that mobile peer: 120kbps, scale 4, 8fps.

## DR-52

1. A mobile receiver has two remote video peers.
2. The mobile receiver marks one peer as active speaker.
3. After sustained poor receive quality, the receiver pauses video from a non-active-speaker peer only.
4. The active speaker video remains unpaused and audio from every peer remains active.
5. After sustained good quality, the receiver restores the paused non-speaker video.


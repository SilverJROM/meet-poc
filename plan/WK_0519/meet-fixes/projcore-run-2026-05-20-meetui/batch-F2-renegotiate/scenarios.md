# Batch F2 Renegotiate Scenarios

## User Report
Video and screenshare deliver zero frames because video added after an audio-only connect is never renegotiated.

## Scenario 1: Camera-Off Join Then Camera On
- Given two clients are admitted to the same room.
- And the sender joined with camera off, so initial local media is audio-only.
- When the sender turns camera on after the peer connection is established.
- Then the receiver gets a live video receiver.
- And inbound video `framesDecoded` and `bytesReceived` advance.
- And the sender uses the pre-negotiated video sender through `replaceTrack`, not a new `addTrack` m-line.

## Scenario 2: Camera-Off Join Then Screen Share
- Given the sender joined camera-off and later turned camera on.
- When the sender starts screen sharing.
- Then the same negotiated video path carries the screen track.
- And the receiver decodes additional inbound video frames.

## Scenario 3: Camera-On Join Regression
- Given the sender joins with camera on.
- When the initial offer/answer completes.
- Then video still negotiates normally.
- And the receiver decodes inbound video frames.

## Scenario 4: Null-Track Sender Preferences
- Given a peer connection is created while the local camera is off.
- Then the pre-negotiated null-track video transceiver sender is stored in `videoSenders`.
- And sender bandwidth preferences apply to that sender before any camera track exists.

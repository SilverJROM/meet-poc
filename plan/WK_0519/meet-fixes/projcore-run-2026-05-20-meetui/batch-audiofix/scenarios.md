# Batch audiofix scenarios

## TS-DR34-01 remote audio survives camera-off tile state

Given an admitted remote peer has a live microphone track and a camera tile,
when that peer turns the camera off and the owner sees the camera-off avatar,
then the owner's remote tile keeps one dedicated `audio[data-remote-audio]` element,
the audio element is unmuted, its `srcObject` is the live `peer.stream`, and playback is active.

## TS-DR34-02 video cannot double-play remote audio

Given a remote peer has camera on,
when the visible remote `<video>` is rendered,
then the video element is muted and remote audio is emitted only by the dedicated audio sink.

## TS-DR34-03 speaker routing includes remote audio sinks

Given a selected speaker output device exists before or during a call,
when remote audio sinks are rendered or audio playback is manually enabled,
then `setSinkId` routing is applied to the new audio elements along with existing media elements.

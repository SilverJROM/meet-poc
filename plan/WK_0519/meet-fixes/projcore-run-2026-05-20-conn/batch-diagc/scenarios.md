# Batch DIAGC Scenarios

## DR-11.1 Auto Degrade
- Given an admitted peer is connected with audio and video senders
- When the local receiver records 3 consecutive poor quality samples
- Then the local UI marks the peer audio-only, shows `Weak connection - audio only`, keeps audio active, and asks the remote peer to pause video sent to this receiver.

## DR-11.2 Auto Restore
- Given a peer is in auto audio-only because of sustained poor quality
- When the receiver records 5 consecutive good quality samples
- Then the audio-only banner clears and remote video is allowed again.

## DR-11.3 Manual Wins
- Given a user enables manual audio-only mode
- Then local outbound video is paused, peers are asked to pause video sent back, and audio stays active.
- When good samples arrive while manual mode is on
- Then auto-restore does not override manual audio-only.

## DR-11.4 Audio Priority
- Given a peer connection has audio and video senders
- Then audio sender parameters are set to high priority and high network priority.
- And video sender parameters are lower priority with a bitrate cap so video yields first under congestion.

## DR-11.5 Indicators
- Given a remote peer has quality state
- Then the tile shows a stable good/weak/poor or audio-only pill, and diagnostics include loss, jitter, RTT, bitrate, and video state.

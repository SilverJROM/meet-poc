# DIAGD Scenarios

## DR-12 Join Prerequisites
- Join/Ask to join remains clickable in lobby unless the room is actively connecting.
- Clicking with no display name shows a dismissible Join requirements popout: "Please add your name".
- Clicking with camera requested but microphone denied shows the mic prerequisite only: "Please enable your microphone".
- Clicking with both missing name and microphone shows: "Please add your name and enable your microphone".
- The popout dismisses with its Dismiss button and with Escape.
- A user may join with the microphone muted as long as a live microphone track exists.

## DR-13 Audio Reservation Invariant
- Audio RTP sender parameters are always reasserted as `priority: high` and `networkPriority: high`.
- Video RTP sender parameters stay lower priority and bitrate-capped so video yields to audio under congestion.
- The invariant survives receiver-video degrade, restore, and local video active toggle.
- No user-facing video quality picker is introduced.

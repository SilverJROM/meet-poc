# DIAGD Review

## Findings
- No blocking issues found in the implemented DIAGD scope.

## Checks
- DR-12 keeps Join clickable except during connecting and routes missing prerequisites through the same popout helper.
- DR-12 mic prerequisite is based on a live audio track, so muted-but-granted joins remain allowed.
- DR-12 camera-on with mic denied is covered by a mocked permission failure and shows the mic message.
- DR-13 audio priority is reapplied on peer setup, sender replacement, receiver-video policy changes, and video active toggles.
- DR-13 does not add a user video-quality picker.

## Residual Risk
- RTP sender priority support is browser-dependent. Unsupported browsers fall back without crashing and still apply the video bitrate cap when parameters are accepted.

# B21b Scenarios

## TINY2 - Mic watchdog stale-read
- Given the local mic is live/enabled/unmuted when the watchdog tick begins.
- When `getOutboundAudioSource()` awaits and the track becomes ended/disabled/muted before it resolves.
- Then the watchdog re-checks live/enabled/unmuted after the await and clears the silence window instead of classifying stale stats as active mic capture.

## TINY4 - Local failure handler re-attach
- Given local audio/video track failure handlers were previously attached.
- When a new stream or replacement track is attached through `attachLocalTrackFailureHandlers`.
- Then prior stored listener refs are removed with `removeEventListener` before new refs are added.

## TINY6 - Disabled track ending
- Given the current local track is intentionally off (`enabled === false`).
- When that disabled current track fires `ended`.
- Then local recovery is ignored.
- Given the current local track is intended on (`enabled === true`).
- When that enabled current track fires `ended` or persistent `mute`.
- Then the existing recovery path still runs.

## ERR9 - Sink race
- Given concurrent sink requests target the same media element.
- When output-device requests arrive rapidly while an earlier `setSinkId` is still in flight.
- Then `setSinkId` calls for that element do not overlap and the coalescer applies the latest desired sink.

# B21a Scenarios

## A8 — Persist Device Id Only After Acquisition Success
- Given a prior-good stored microphone id and a newly selected microphone that fails acquisition, storage is restored to the prior-good id.
- Given no prior stored microphone id and a newly selected microphone that fails acquisition, storage remains absent.
- Given acquisition succeeds, the success path persists through the acquired-track sync path, not before getUserMedia/replace succeeds.

## A9 — Clear Stale Camera Pin
- Given the selected/stored camera id is missing from enumerated cameras, refresh clears `videoDevicePinned` before substituting a fallback id.
- Given the selected camera id is still enumerated, refresh keeps the pin.

## A12 — In-Call Mic Re-Enable Uses Existing Ladder
- Given in-call mic toggle has no live audio track, room routes to `replaceInCallAudio` / `MediaService.replaceAudioTrack`.
- Given in-call mic toggle has a disabled but live audio track, room keeps the existing `media.toggleMic` fast path.
- Given a wrong requested mic id fails exact acquisition, `acquireAudio` retries exact -> ideal through the existing media-acquisition ladder.

## TINY3 — Mic State Requires Live Track
- Given an enabled live acquired audio track, `micOn` can become true.
- Given an enabled but ended acquired audio track, `micOn` remains false.

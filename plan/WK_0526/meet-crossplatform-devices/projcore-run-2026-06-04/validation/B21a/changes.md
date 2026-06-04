# B21a Changes

## User Report Verbatim
"A8 (persist device id only AFTER acquisition success + rollback), A9 (clear videoDevicePinned when stored cam id missing), A12 (route in-call mic re-enable through the existing fallback ladder, not exact-only), TINY3 (set micOn only for a LIVE track)."

## Root Cause
- A8: `changeAudioDevice` and `changeVideoDevice` wrote selected ids to localStorage before the replacement/reacquire path proved the device could be acquired. Failure paths did not restore the previous stored value.
- A9: `refreshDevices` replaced a missing stored/selected camera id with a fallback id but left `videoDevicePinned` true, causing the fallback id to be treated as an exact pin.
- A12: `toggleMic` routed the acquire-new-track case through the generic toggle path instead of the in-call replacement path already used for device switching and SFU audio replacement.
- TINY3: `replaceAudioTrack` and `toggleMic` set `micOn` from `track.enabled` only, so an already-ended acquired track could show as mic-on.

## Per-File WHY
- `frontend/src/app/pages/room/room.page.ts`: stages audio/video device selections, restores previous selected/stored ids on failed acquisition, clears stale video pins during refresh, and routes no-live-track in-call mic toggles through `replaceInCallAudio`.
- `frontend/src/app/pages/room/room-decisions.ts`: adds pure decision seams for rollback storage, stale camera pin clearing, and in-call mic toggle route selection.
- `frontend/src/app/pages/room/room-decisions.spec.ts`: proves A8, A9, and A12 route decisions without Angular.
- `frontend/src/app/services/media.service.ts`: records the audio acquisition stage, allows `replaceAudioTrack` to acquire via the existing ladder even when the local stream is missing, and gates mic-on state on `readyState === 'live' && enabled`.
- `frontend/src/app/services/media.service.spec.ts`: proves TINY3 live-track mic state behavior.
- `frontend/src/app/services/media-acquisition.spec.ts`: adds the A12 exact -> ideal fallback assertion for a wrong microphone id.

## Honest Note
The proof is unit-level and build-level. Real cross-device persistence/reload confirmation remains JROM's seat per the north-star; fake-media browser E2E cannot prove real Overconstrained device behavior.

Autonomous decisions: none beyond the approved plan. The only implementation detail was preserving the acquired audio stage so fallback success does not repersist a failed exact id while exact success can still keep the requested id.

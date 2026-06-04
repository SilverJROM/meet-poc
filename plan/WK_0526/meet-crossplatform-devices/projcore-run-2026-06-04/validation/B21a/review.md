# B21a Review

## Scope Review
- Touched only B21a frontend media/device files and focused specs.
- Did not touch SFU/signaling/recorder/transport, B16-B20 implementation areas, mic select template, or already-fixed ERR8/TINY5/TINY7/REC7/REC9/REC10.
- Existing unrelated dirty/untracked files were left untouched.

## Mechanism Review
- A8: storage writes for selected input devices are no longer made before acquisition in audio paths. Failed selection attempts restore the prior stored value, including the empty/absent case. Success paths persist via acquired-track sync.
- A9: stale selected camera ids now clear `videoDevicePinned` before fallback substitution.
- A12: room-level mic toggle checks whether the current audio track is live. No-track/ended-track acquisition routes through `replaceInCallAudio`, which calls `MediaService.replaceAudioTrack` and the shared `acquireAudio` ladder.
- TINY3: acquired audio tracks only set mic-on when live and enabled.

## Residual Risk
- Real hardware can still report generic device ids such as `default`; stage-aware audio sync keeps exact-success behavior while avoiding failed-exact repinning after fallback. Real-device reload remains the final validation surface.

# Batch GUM Constraints Review

## Scope Review
- DR-48-only source changes: audio constraint generation and diagnostics display/plumbing.
- No changes to signaling, room admission, media-state contracts, remote audio playback, or backend diagnostics persistence.
- DR-29 exact device selection remains exact; fallback remains handled by the existing switch/recovery catch paths.
- DR-46 recovery calls MediaService.replaceAudioTrack(), so recovered tracks receive the same EC/NS/AGC request shape.

## Diff Review
- MediaService central helper covers lobby preflight, lobby reacquire, in-call replacement, device switch, and local audio recovery.
- Diagnostics fields are optional to keep old persisted samples readable.
- The diagnostics UI handles missing/ignored settings as n/a, so browsers that ignore a setting still render without throwing.

## Risk
- Low. The browser may ignore individual audio processing flags, but because they are plain true requests rather than exact constraints, they should not make supported microphone acquisition fail.

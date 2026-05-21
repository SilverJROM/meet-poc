# DR-46 Scenarios

- Mic track `ended`: while in-call with a connected peer, the active local audio track ends after the selected mic disappears; the app reacquires an available fallback mic, replaces the outbound audio sender track, keeps audio sender priority high, updates selected mic state after success, and does not show "refresh to rejoin".
- Transient mic `mute`: a local audio `mute` event followed by `unmute` within the debounce window does not reacquire or replace the mic track.
- Camera track `ended` with fallback: while in-call with camera on, the active local video track ends after the selected camera disappears; the app reacquires a fallback camera, replaces the outbound video sender track, updates selected camera state after success, and shows a fallback/switch notice.
- Camera track `ended` with no fallback: if no camera remains available after capped retries, the app replaces the outbound video sender with `null`, removes the dead local camera track, broadcasts `cam=false`, and shows "No camera available. Camera is off."
- Retry cap: recovery attempts are capped with small backoff; no tight loop is allowed when no device exists.

# M-B4 Review

## Findings

No blocking findings.

## Review Checks

- AudioContext creation is no longer performed by mobile lobby preflight.
- Mobile lobby shows a local pill in the mic-meter region before activation.
- The activation path creates/resumes the AudioContext from the user-triggered pill path.
- Desktop mic-meter behavior remains auto-starting, preserving Run 1 B5 regression.
- Camera switch is not rendered on desktop.
- Camera switch tests assert `lastVideoConstraints.video.facingMode`, avoiding fake-media track-ID false confidence.
- `facingMode` takes precedence over `deviceId` to avoid conflicting constraints.
- Mobile selectors use breakpoint-driven single-column layout.
- No backend, WebRTC signaling, MediaRecorder fallback, or compact 5-bar meter work was added.

## Residual Risk

The automated AudioContext gate proves the activation path in Chromium. Real iOS Safari still needs device validation later in Run 3, but the known autoplay-policy failure mode is addressed by moving AudioContext creation/resume behind a tap.

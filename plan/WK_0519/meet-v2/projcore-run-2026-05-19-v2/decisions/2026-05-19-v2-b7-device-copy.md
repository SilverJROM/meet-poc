# Decision: B7 Device Failure Copy

## Context

B7 needs clearer media failure states without expanding into full browser-specific troubleshooting.

## Decision

Use these user-facing strings:

- Denied: "Microphone access denied" plus instructions to allow microphone access for `voice.silverjrom.app` and click Retry.
- No devices: "No microphone detected" plus "Please connect a microphone and refresh the page."
- Camera denied but audio works: "Camera unavailable — joining audio-only. You can enable video later if browser permissions change."
- Mid-call mic loss: "Microphone disconnected. Please refresh to rejoin."

## Rationale

The copy is short, action-oriented, and separates blocking audio failures from non-blocking camera-only failure.

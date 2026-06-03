# B1 Scenarios — Host Audio Recovery

## S1 — Chromium #121673 kickstart element
- Join host alone with mixer enabled.
- Inject a synthetic remote source through the localhost-only mixer debug hook.
- Assert a hidden `audio[data-remote-audio-kickstart="<peer>"]` exists.
- Assert the kickstart element is muted, unpaused, and holds a `MediaStream`.
- Assert mixer output remains unpaused and the banner is hidden.

## S2 — Any in-call interaction resumes suspended context
- Join host alone, enable remote audio, and inject a remote source.
- Suspend the live remote-audio `AudioContext` with the debug hook.
- Press a key that is not the fallback banner button.
- Assert `contextState === 'running'`, mixer output is unpaused, and the fallback banner clears.

## S3 — Host-alone then late source recovers on source add
- Join host alone with no remote source.
- Resume once, suspend the context, then inject a late remote source.
- Assert kickstart element exists and is playing.
- Assert source-add recovery reaches `contextState === 'running'` and no banner tap is required.

## S4 — No regression
- Mute-all remains gain-based: mixer output stays playing while `mutedAll === true`.
- Volume changes still update the service volume signal.
- B2 limiter constants remain unchanged.

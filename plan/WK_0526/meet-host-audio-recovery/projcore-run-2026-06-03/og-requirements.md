# og-requirements.md — meet-host-audio-recovery (contract)

## R1 — Remote voice actually plays (fix the known Chrome root causes)
Remote participants' voice must be RENDERED on every device. Two documented Chrome causes (web research, north-star):
- **Chromium #121673:** a remote track in `createMediaStreamSource` is SILENT unless the same MediaStream is ALSO attached to a muted, playing HTMLAudioElement. Our mixer nulls the per-tile <audio> when enabled → no kickstart → silent.
- **Suspended AudioContext** (autoplay/idle) → resume needed.

**Acceptance:**
1. For every remote audio source added to the mixer, a muted, playing HTMLAudioElement holds that stream (kickstart for #121673) so the Web-Audio mixer actually produces sound. (Mute-all/volume still via the gain node; the kickstart element is muted so no double audio.)
2. AudioContext resumes automatically (any in-call interaction) and does not stay suspended through an idle host-alone period; recovery does NOT require a banner tap (banner = last-resort only).
3. Host-joins-first / guest-joins-late: host hears the guest (jitterBufferEmittedCount climbs) with no user action.
4. No regression: volume/setVolume, mutedAll/setMutedAll, the B2 limiter, mic-persistence, in-call camera, common-case playout.

## R2 — Self-healing per-party voice-playout watchdog (JROM directive, durable fix)
On EVERY device (host + guests), continuously monitor whether each remote participant's voice is actually being PLAYED, and auto-recover when it isn't — no user action.

**Acceptance:**
1. A watchdog samples each remote audio track (~1-2s) tracking bytesReceived + jitterBufferEmittedCount.
2. Detects RECEIVING-BUT-SILENT: bytesReceived increasing while jitterBufferEmittedCount stays flat over N consecutive samples (the exact 45197347 signature).
3. On detection, auto-runs a recovery ladder WITHOUT user action, escalating until emitted resumes climbing: (a) resume AudioContext, (b) ensure kickstart muted <audio> attached+playing for that stream, (c) re-play mixer output element, (d) rebuild the mixer source for that peer. Each remediation logged.
4. Runs on host AND guests (not host-only). Stops escalating once emitted climbs again; backs off to avoid thrash.
5. Deterministic proof: a test driving the detector over a receiving-but-emitted-flat fixture asserts it fires + the ladder is invoked; integration/e2e if feasible. Live = JROM real call.
6. No regression / no audible artifacts during normal play (watchdog silent when healthy).

## Out of scope
SFU subscribe/transport, sender capture, diagnostics schema, layout, mic-join-gate. No new auto-mute/feedback UI.

# P3-LIVE-05 changes.md

## Summary

Batch requirement: "One PASS live split-host SFU smoke — both publish + receive WAV rms>0."

**STATUS: BLOCKED.** The environment fix (PulseAudio null-sink on `.140`) is installed and
**independently verified working** via an isolation test — but the full live SFU smoke still
returns exact silence, and new evidence points to a **different, deeper** cause than "no audio
backend": the app's own inbound-voice watchdog independently flags this peer's audio as stalled,
based on SFU stats (not our capture mechanism). Full narrative:
`decisions/2026-07-10-p3-live-02-invalid-no-pc.md` (2026-07-10 — P3-LIVE-05 section, appended).

## What was done (env change, approved)

1. `sudo apt-get install -y pulseaudio pulseaudio-utils` on `.140` — confirmed via `apt-cache
   policy` beforehand that no PulseAudio/PipeWire *server* was installed (only client libs), so no
   conflict risk. Package's own postinst enabled `pulseaudio.socket`/`pulseaudio.service` as
   **user-scoped** systemd units (`/etc/systemd/user/...`) — not a system-wide service, matches the
   approved "per-user daemon, not systemd system service" intent (systemd --user is the modern,
   standard way to run this, just user-scoped rather than the older `pulseaudio --start` script).
2. Started it: `systemctl --user start pulseaudio.socket`. PulseAudio auto-created its own
   hardware-fallback null sink (`auto_null`) since no real sound card exists — no manual
   `module-null-sink` load was needed, PulseAudio does this itself when it finds no hardware.
3. **Isolation test (brief item 2, run BEFORE any live SFU call):** local-only, no-.123, no-SFU
   script — a real two-`RTCPeerConnection` loopback (fake-device mic → offer/answer → remote
   track) feeding a genuine `<audio srcObject>` element, then `captureStream()`'d exactly like
   `dom-audio-capture.ts` does. **PASSED**: `maxAbs≈1.075` (real signal, not zero) — confirms the
   null-sink fixes captureStream-on-a-real-WebRTC-track-element in general. Deleted after use.

## What's still blocked: the full live smoke, different cause than expected

Re-ran the P3-LIVE-04 split-host smoke (as `e2e/harness/p3-live-05-smoke.ts`, same setup —
`module-remap-source` on `.123`, DOM capture on `.140`) twice. Both runs: both legs published live
(server-confirmed, same gate as every prior batch), DOM capture mechanism ran cleanly (element
found, healthy diagnostics: `muted:false, volume:1, paused:false, trackReadyState:"live"`) — and
the WAV was **exact digital silence again**, same as P3-LIVE-04, despite the isolation test proving
the audio-backend fix works for the general case.

**New evidence, not available in P3-LIVE-04:** queried the app's own instrumentation
(`window.__meetDebug.remoteAudioMixer.debugSnapshot()`, real product code — see
`remote-audio.service.ts:476-495`) at the same moment as the silent capture:
```
contextState: "running", unlocked: true, outputAttached: true, outputPaused: false,
mixerEnabled: true, mixedPeerIds: [<one peer>], blockedPeerIds: [<same one peer>],
voiceRecoveryCounters: { resume: 1, kickstart: 0, replay: 0, rebuild: 0 }
```
The app's AudioContext is genuinely `"running"` (not suspended — rules out the "context never
resumed" variant of the original hypothesis) and audio is `unlocked`, yet the **one active peer is
in `blockedPeerIds`**. Traced `remoteAudioBlockingReason()` (`remote-audio.service.ts:821-827`):
with `el.paused` confirmed false, the only remaining reasons are `sink-failed` or `voice-stalled`.
Traced `voiceStalled` further to `observeRemoteVoiceTrack()` / `decideRemoteVoiceWatchdogAction()`
(`room.page.ts:3195-3234`) — a watchdog that samples **inbound SFU stats** (packets/bytes actually
received, not local rendering) and calls `markVoiceStalled()` on `'escalate-recovery'`. The
`voiceRecoveryCounters.resume: 1` in the snapshot is consistent with this watchdog having already
fired and attempted one recovery action during our 6s dwell.

**This reframes the problem.** If the watchdog is reacting to real SFU inbound-stats stalling,
the audio backend was never the (sole) blocker — the deeper question is whether real RTP audio
packets are reliably arriving at `page1` from `bot-123`'s real-mic leg at all on this specific
split-host topology, independent of how it's captured/rendered locally. That's an SFU/media-relay
question, not an audio-backend or captureStream question, and is out of this batch's "env +
harness smoke only" scope (no product/backend code touched, per the brief's own gate).

## No app code touched

`git status --short frontend/ backend/`: empty.

## Calls / cleanup

- 2 live smoke attempts (`acceptanceAttempt:false`, `purpose:"smoke"`); `callBurnCount` unchanged
  at 0. Both rooms (`28bcc64a1014`, `0affd695873e`) deleted inline by the script itself (HTTP 200
  each) — no leak.
- Isolation test: no rooms, no .123, no SFU, no ledger impact.
- Remote (.123): no leftover chrome/Xvfb, remap-source module unloaded, default-source restored.
- Local (.140): no leftover chrome processes from this batch's own scripts (one unrelated
  `chrome-headless-shell` process observed post-run, different Chrome variant/cache path than
  anything this batch launches — left untouched, not mine to kill, likely a concurrent batch).
- `free -h` checked before both live launches (29-30Gi avail, well above the 2Gi floor).
- PulseAudio package + user-session daemon **left installed and running** per the approved plan
  (every future P3-LIVE batch needs it; isolation test justifies keeping it).

## Recommendation for the next batch

Investigate whether real RTP audio is actually reaching `page1` from `bot-123`'s real-mic leg —
e.g. sample `__meetDebug.sfuGetStats()` inbound-audio `packetsReceived`/`bytesReceived` deltas over
the dwell window (not just published-bytes on the sending side, which this batch and all priors
already confirm is nonzero) to see whether they advance at all. If inbound stats genuinely never
advance, this points at the SFU relay or the split-host CDP topology itself, not the receiving
browser's audio pipeline — a bigger, different investigation than anything tried across
P3-LIVE-02 through -05, and likely needs backend/SFU visibility this run's harness-only scope
doesn't have.

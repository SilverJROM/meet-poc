# P3-LIVE-08 changes.md

## Summary

Requirement: "One PASS live split-host SFU smoke — both publish + receive rms>0."

**STATUS: DONE — PASS.** First PASS across the entire P3-LIVE-01 through P3-LIVE-08 chain.
`speaker1.publishedBytes=2414 > 0`, `speaker2.publishedBytes=361 > 0`, receive WAV
`rms=0.087941`. Independently verified (not just trusting the script's own rms calc): parsed the
WAV's raw PCM directly — 180715/262144 samples nonzero, max amplitude 20594/32767. Real,
substantial audio, not a rounding artifact.

## Root cause and fix (harness-only)

Isolation test (local-only, no SFU/no `.123`, matching `dom-audio-capture.ts`'s
`startRawRemoteStreamCapture` graph shape exactly): real fake-device mic → loopback
`RTCPeerConnection` pair → `createMediaStreamSource()` **directly on the raw `pc.ontrack`
stream** → `ScriptProcessorNode`. Result: `maxAbs: 0` for mono, stereo, and even the exact
baseline P3-LIVE-05 previously reported working. This revealed that P3-LIVE-06's
`startRawRemoteStreamCapture` (which taps `sfuRemoteStreams` and calls
`createMediaStreamSource()` directly, no element involved) was never actually validated in
isolation — I had assumed "single-hop = the working P3-LIVE-04/05 pattern" without noticing those
tests all attached the raw stream to a **playing** `<audio>` element before `captureStream()`.

**Root cause**: Chromium does not decode/render a remote WebRTC audio track — even one reporting
`readyState:"live", enabled:true, muted:false` — unless something actively plays it.
`createMediaStreamSource()` alone, with no playing sink anywhere, is a silent no-op tap.

**Fix**: `dom-audio-capture.ts`'s `startRawRemoteStreamCapture()` now attaches the raw stream
(from `sfuRemoteStreams`) to a dedicated, **harness-owned** `<audio>` element (deliberately not
the app's `data-remote-audio` element — that would reintroduce the P3-LIVE-06
double-AudioContext-hop bug), `.play()`s it, then `captureStream()`s **that** element before
building the existing `ScriptProcessorNode` capture graph. Confirmed live (isolation, zero SFU):
mono and stereo both got real signal (`maxAbs≈1.075`) with this step present, `0` without it —
channelCount was never the actual cause, contrary to the P3-LIVE-07 lead.

`startDomRemoteAudioCapture` (the original app-element path, separately broken by the
double-AudioContext-hop bug found in P3-LIVE-06) is left unchanged/unused, matching this run's
precedent of keeping disproven-but-documented code for the historical record rather than deleting
it.

## Files changed

- `e2e/harness/dom-audio-capture.ts`: `startRawRemoteStreamCapture()` fixed as above (+~16 lines:
  dedicated element creation/play/captureStream, cleanup extended to pause+remove it). No changes
  to `startDomRemoteAudioCapture`, `stopDomRemoteAudioCapture`, `sampleInboundAudioStats`,
  `sampleOutboundAudioStats`.
- `e2e/harness/p3-live-08-smoke.ts` (new, copy of `p3-live-07-smoke.ts`): same setup —
  `module-remap-source` on `.123`, PulseAudio null-sink on `.140`,
  `speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`, raw-stream capture — unchanged except for
  the `dom-audio-capture.ts` fix itself and a distinct CDP port (9340).

## No app code touched this batch

`git status --short frontend/ backend/`: empty. All P3-LIVE-07's product changes
(`mic-energy.ts`/`media.service.ts` AGC/NS/EC override) are kept as-is, already committed, and
were exercised again this run (`getSettings()` confirms `autoGainControl:false,
echoCancellation:false, noiseSuppression:false` on bot-123's track, same as P3-LIVE-07).

## Evidence

`validation/p3-live-08-evidence/`:
- `p3l04-dom-receive-<id>.wav` — the receive-side capture, real signal (verified above).
- `p3l04-dom-receive-<id>.meta.json` — mechanism metadata (rms, sample/callback counts).
- `p3-live-08-result.json` — full call result including `domRms`, publish byte counts,
  `senderSettingsResult` (AGC/NS/EC confirmation).

## Calls / cleanup

- 1 live smoke attempt (`acceptanceAttempt:false`, `purpose:"smoke"`); `callBurnCount` unchanged
  at 0 — this PASS does not count against the 25-cap (smoke, not an acceptance attempt, per this
  run's standing distinction).
- Room (`86969f1d5e8b`) deleted inline (HTTP 200) — no leak.
- Remote (`.123`): no leftover chrome/Xvfb, `module-remap-source` unloaded, default-source
  restored, confirmed `pactl list modules short | grep remap` empty after.
- `free -h` checked before launch (28.08Gi avail, well above the 2Gi floor).

## What this PASS proves and does not prove

Proves: the split-host `.140`↔`.123` live SFU topology can carry real audio from a PipeWire
virtual-mic route on `.123`, through the SFU, to a receiving browser on `.140`, and that audio can
be captured and measured as genuine voiced energy — end to end, for the first time in this run.

Does not (yet) prove: this specific smoke is a short (~15s), `acceptanceAttempt:false` run, not
one of the 25-cap Phase 3 acceptance attempts the north-star's exit condition counts. Whether/how
this feeds into that 25-count is a coordinator-level decision (queue/exit-procedure), not decided
here — flagging, not assuming.

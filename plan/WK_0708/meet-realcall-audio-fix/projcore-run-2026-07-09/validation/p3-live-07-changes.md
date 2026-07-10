# P3-LIVE-07 changes.md

## Summary

Requirement: "One PASS live split-host SFU smoke — both publish + receive energy rms>0."

**STATUS: BLOCKED.** The AGC/NS/EC constraint override was implemented, shipped, built, and
**verified working** — `getSettings()` on bot-123's actual captured track confirms
`autoGainControl:false, echoCancellation:false, noiseSuppression:false`, exactly as requested, on
this exact call. **The capture is still exact digital silence.** This eliminates Chrome's own
capture-side audio processing as the cause — the P3-LIVE-06 leading hypothesis is now disproven,
not just untested. One fresh, previously-uncontrolled variable surfaced in this run's own evidence
(`channelCount: 2`, stereo) — flagged below, not chased further given batch scope/time. Full
narrative: `decisions/2026-07-10-p3-live-02-invalid-no-pc.md` (2026-07-10 — P3-LIVE-07 section).

## Product change shipped (approved plan)

- `frontend/src/app/services/mic-energy.ts`: `audioCaptureConstraints()` gained a third parameter,
  `disableProcessing = false`. When true, requests `echoCancellation: false, noiseSuppression:
  false, autoGainControl: false` (hard boolean) instead of today's `{ideal:true}` trio.
  `deviceId` handling unchanged.
- `frontend/src/app/services/media.service.ts`: `audioConstraints()` now passes
  `this.shouldDisableAudioProcessing()` through — a new private helper reading
  `new URLSearchParams(window.location.search).get('e2eDisableAudioProcessing') === '1'`.
  **Default behavior for every real user is byte-for-byte unchanged**: the query param is never
  present on a real join URL, so this always returns `false` there.
- `e2e/harness/call-driver.ts`: new optional `CallDriverConfig.speaker2ExtraQuery?: string`,
  applied only to `page2`'s (split-host real-virtual-mic leg) join URL inside
  `joinDualBrowserCallSplitHost` — `page1`'s URL/behavior, and the non-split-host
  `joinDualBrowserCall` function, are untouched.
- `frontend`: rebuilt (`npm run build` / `ng build`) — confirmed the dev server serves the new
  bundle (`main-2AFEJS4O.js` hash matched between the build output and a live `curl` of `/`)
  before running the live smoke, per this project's standing deploy-model note (FE is a prebuilt
  static bundle; a committed fix isn't live until rebuilt).
- `e2e/harness/p3-live-07-smoke.ts` (new, copy of `p3-live-06-smoke.ts`): passes
  `speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`, reads `getSettings()` on bot-123's track
  mid-call to verify the override actually applied (not just requested), and uses the
  already-shipped `startRawRemoteStreamCapture()`.

## Verification (brief item 4) — the override genuinely works

Read directly off bot-123's live, in-call `MediaStreamTrack.getSettings()`:
```
{"autoGainControl":false,"channelCount":2,"echoCancellation":false,"noiseSuppression":false,
 "sampleRate":48000,"sampleSize":16,"voiceIsolation":false}
```
All three requested flags applied exactly as asked — confirmed on the exact track for this exact
call, not assumed. The constraint-override mechanism itself is correct and works.

## Still silent — this hypothesis is now eliminated, not just unresolved

With AGC/NS/EC confirmed off: inbound RTP still advances normally (Δ308 packets / Δ38080 bytes
over the dwell, consistent with every prior batch's delivery numbers), `startRawRemoteStreamCapture`
runs clean (no errors, no `DOM_CAPTURE_*` throw), and the resulting WAV is still exact zero
(`domRms: 0`). Every layer this run's harness can inspect — PipeWire source (ground-truth,
P3-LIVE-06), SFU/RTP delivery (proven twice, P3-LIVE-06 and this batch), track health
(`live`/`enabled`/`unmuted`, checked repeatedly), the app's own AudioContext state (`running`,
P3-LIVE-05), the capture graph shape (single-hop, proven with local isolation tests, P3-LIVE-06),
and now Chrome's own capture-side processing (all off, this batch) — reports healthy or has been
fixed, and the symptom is unchanged in every case.

## One fresh lead surfaced, not chased (out of remaining scope/time)

This run's own `getSettings()` output shows `"channelCount": 2` (stereo) on bot-123's captured
track — every prior isolation test that got real signal (P3-LIVE-04's oscillator, P3-LIVE-05's
fake-device loopback) used `getUserMedia({audio: true})` with no explicit channel constraint,
which typically yields mono on Chrome's default fake/real devices. This is a genuinely
uncontrolled variable between "isolation tests that worked" and "the live call that never has":
whether `dom-audio-capture.ts`'s `createScriptProcessor(4096, 1, 1)` (1 input channel, forcing a
downmix) correctly handles a genuinely stereo remote track end-to-end has not been isolated on its
own. Flagging as the next concrete, narrow thing to test — not proven, not chased further here.

## No unintended app-code impact

`git diff --stat frontend/ backend/`: exactly the 2 files listed above, +29/-5 lines total. Grepped
for other callers of `audioCaptureConstraints()`/`media.service.ts`'s `audioConstraints()` — the
one call site (`private audioConstraints()`) feeds every `acquireAudio()` call in the file (join,
preflight, device-switch, re-acquire) via the same private method, all now uniformly gated by the
same opt-in query param default-false check — no path bypasses it, no path is affected without the
param present.

## Calls / cleanup

- 1 live smoke attempt this batch (`acceptanceAttempt:false`, `purpose:"smoke"`);
  `callBurnCount` unchanged at 0. Room (`d4060a835ff1`) deleted inline (HTTP 200) — no leak.
- Remote (.123): no leftover chrome/Xvfb, remap-source module unloaded, default-source restored,
  confirmed `pactl list modules short | grep remap` empty after.
- `free -h` checked before launch (27.8Gi avail, above the 2Gi floor — memory was not actually
  tight this run despite the brief's own flag).

## Recommendation for the next batch

Isolate the stereo-channel variable specifically: a local-only, no-SFU test (same shape as
P3-LIVE-04/05/06's isolation tests) using `getUserMedia({audio: {channelCount: 2}})` explicitly,
captured through the exact same `dom-audio-capture.ts` single-hop graph, to see if a genuinely
2-channel source reproduces the silence outside any SFU/network involvement. If it does, the fix
is in `dom-audio-capture.ts`'s capture graph (e.g. explicit stereo→mono handling); if it doesn't,
the search continues elsewhere. Given how many other explanations are now eliminated
(SFU/RTP/PipeWire-source/AudioContext-state/double-hop/AGC-NS-EC), this is the narrowest remaining
untested difference between "isolation tests that got real signal" and "the live call that
never has."

# P3-LIVE-06 changes.md

## Summary

Requirement: "Prove whether inbound audio RTP advances at page1 from bot-123; if not, fix
harness/topology so live smoke gets rms>0."

**STATUS: BLOCKED**, but with a fully narrowed, well-evidenced root cause. **Inbound RTP DOES
advance** — proven, not assumed (see below). The remaining silence is traced past every layer this
run's harness can influence, down to a single, specific, plausible cause: **Chrome's own capture-
side audio processing (`autoGainControl`/`echoCancellation`/`noiseSuppression`, all confirmed
`true` on bot-123's actual captured track) is very likely suppressing the PipeWire-looped playback
signal as "non-voice noise"** before it ever reaches the encoder. Fixing that needs an app-level
`getUserMedia` constraint override — out of this batch's harness/env scope. Full narrative:
`decisions/2026-07-10-p3-live-02-invalid-no-pc.md` (2026-07-10 — P3-LIVE-06 section, appended).

## Instrumentation shipped (approved plan, item 1)

- `dom-audio-capture.ts`: `sampleInboundAudioStats(page)` / `sampleOutboundAudioStats(page)` —
  same `RTCStatsReport` iteration shape `call-driver.ts`'s existing `sampleOutboundAudioBytes()`
  uses, filtering `inbound-rtp`/`outbound-rtp` + `kind==='audio'`, reading
  `packetsReceived`/`bytesReceived` or `packetsSent`/`bytesSent`.
- `p3-live-06-smoke.ts` (new, copy of `p3-live-05-smoke.ts`): samples page1 inbound + page2
  outbound at t0 (dwell start) and t1 (dwell end), writes deltas to
  `validation/p3-live-06-evidence/inbound-stats.json` unconditionally (evidence either way, per
  the approved plan).

## Result 1: inbound RTP genuinely advances (brief item 3's "delta>0" branch)

Three live runs, consistent: page1's inbound audio `packetsReceived`/`bytesReceived` advance in
**near-1:1 lockstep** with page2's (bot-123's) outbound `packetsSent`/`bytesSent` over the same
~5.3s window — e.g. run 3: inbound `Δpackets=303, Δbytes=41160` vs outbound
`Δpackets=304, Δbytes=41320`. This rules out the SFU/media-relay as the blocker — real RTP audio
packets are reliably delivered from bot-123 to page1 on this split-host topology. Per the approved
plan, this branch calls for "report with evidence, no topology change" — which is what the rest of
this batch does, going further than a bare report because a concrete, testable next mechanism
(double-hop, then audio-processing) was cheap to isolate.

## Result 2: found and fixed a genuine local bug (double-AudioContext-hop), but it wasn't the whole story

Isolated **locally, no SFU/no .123** (deleted after use): the app's own remote-audio pipeline
(`remote-audio.service.ts:730-751`, `createRemoteAudioGraph()`) feeds `<audio data-remote-audio>`
elements from its **own** internal `AudioContext` (gain → compressor →
`createMediaStreamDestination()`), not the raw WebRTC stream. `dom-audio-capture.ts`'s
`captureStream()` on that element therefore taps the OUTPUT of one AudioContext from a **second**,
independent one. Reproduced the exact symptom (all-zero samples, everything else reporting
healthy — running contexts, unpaused/unmuted element, live track) with a synthetic two-hop test:
real fake-device mic → loopback RTCPeerConnection → app-shaped gain/compressor graph → element →
`captureStream()` → second AudioContext = **`maxAbs: 0`**. The isolation tests from P3-LIVE-04/05
(single-hop: raw stream straight into one AudioContext, no intermediate element/context) all got
real signal — confirming the double-hop specifically is what breaks in Chromium.

**Shipped the fix for this**: `startRawRemoteStreamCapture()` (new function in
`dom-audio-capture.ts`) taps `window.__meetDebug.sfuRemoteStreams` (real product code,
`sfu-client.service.ts:114`) directly — the RAW remote `MediaStream`, before the app's own
processing graph — feeding it into a single capture `AudioContext`, matching the isolation tests'
working shape. Trade-off disclosed: this proves energy arrived and is decodable (the acceptance
bar), but is pre-gain/compressor, not bit-identical to what a human hears through the app.
`p3-live-06-smoke.ts` was switched to use this instead of the P3-LIVE-04/05 element-capture path.

**But the live smoke, re-run with this fix, is STILL exact silence.** The double-hop bug is real
(confirmed) and now avoided, but it wasn't the (sole) cause of the live-call silence.

## Result 3: verified real signal exists at the PipeWire source, then found the actual leading suspect

Ground-truth check, bypassing Chrome/WebRTC entirely: `scp`'d the speech WAV to `.123`, ran the
same `paplay --device=<sink> ...` loop the harness uses, and recorded directly from `virtual_mic`
with `parecord` (pure PipeWire, no browser involved). **Result: real signal** —
139710/196608 samples nonzero, max amplitude 18564/32767. This rules out "the source itself is
silent" — `module-remap-source`'s `virtual_mic` genuinely carries real audio.

Added one more diagnostic to the live smoke: read `getSettings()`/`getConstraints()` on bot-123's
actual captured `MediaStreamTrack` (via `window.__meetDebug.localStream`, real product code,
`room.page.ts:606`). Result: **`autoGainControl: true, echoCancellation: true,
noiseSuppression: true`** — all three enabled, confirmed on the exact track feeding this exact
call, not assumed from an unrelated earlier test. Chrome's own noise-suppression model is a
well-known source of aggressive gating on audio that doesn't look "voice-like" to its heuristics
(e.g. audio replayed through a monitor/remap loopback rather than a physical mic capturing a real
room) — a strong, specific, testable next-step candidate for why real, RTP-delivered, non-silent-
at-the-source audio decodes to exact zero by the time any JS-visible layer reads it.

**Fixing this needs `getUserMedia({audio: {echoCancellation:false, noiseSuppression:false,
autoGainControl:false}})` (or per-constraint overrides) on the real-virtual-mic capture path** —
that's an app-level constraint (`media.service.ts`, not touched this batch), out of this batch's
"harness + diagnostics first; topology/env fixes ok" scope without its own PROPOSED+APPROVED.

## No app code touched

`git status --short frontend/ backend/`: empty. Everything confined to `e2e/harness/`
(`dom-audio-capture.ts` extended, `p3-live-06-smoke.ts` new) + `plan/` docs.

## Calls / cleanup

- 3 live smoke attempts this batch (`acceptanceAttempt:false`, `purpose:"smoke"`);
  `callBurnCount` unchanged at 0. All 3 rooms deleted inline by the script (HTTP 200 each,
  confirmed) — no leak.
- One `module-remap-source` instance (id `536870913`) was left loaded on `.123` after an earlier
  run in this batch (unrelated to the fix work — the specific run that left it wasn't the final
  one, and its own console output claimed successful unload; not fully explained, flagging as a
  minor harness robustness gap, not investigated further given time). Found and unloaded manually
  before finishing; `default-source` restored; confirmed `pactl list modules short | grep remap`
  empty afterward.
- Local-only diagnostics (double-hop isolation test, PipeWire ground-truth `parecord` check): no
  rooms, no .123 SFU calls, no ledger impact. Scratch files (`double-hop-diag.ts`, remote
  `/tmp/verify-*` files) deleted after use.
- `free -h` checked before every live launch (28-29Gi avail, well above the 2Gi floor).

## Recommendation for the next batch

Propose disabling `echoCancellation`/`noiseSuppression`/`autoGainControl` specifically for the
`real-virtual-mic` device-mode capture path — either as an app-level constraint override
(`media.service.ts`, needs its own PROPOSED+APPROVED per this run's product-code gate) or, if a
harness-only alternative exists, investigate whether Chrome exposes any launch-time override for
default audio-processing constraints (not confirmed to exist — W3C spec makes these per-call
`MediaTrackConstraints`, typically JS-level, not a blanket Chrome flag). If the app-level override
gets approved and tested, `startRawRemoteStreamCapture()` (shipped this batch) should immediately
start seeing real signal, since every other layer (SFU delivery, RTP transport, PipeWire source,
Web Audio graph shape) is now confirmed healthy.

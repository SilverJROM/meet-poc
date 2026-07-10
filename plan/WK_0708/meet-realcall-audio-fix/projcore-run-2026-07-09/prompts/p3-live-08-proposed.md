# P3-LIVE-08 PROPOSED plan

## Isolation test result: stereo was NEVER the cause — found the real bug (in our own harness code)

Ran the local-only, no-SFU isolation test the brief called for (option a), matching
`dom-audio-capture.ts`'s `startRawRemoteStreamCapture()` graph shape EXACTLY (real fake-device
mic → loopback `RTCPeerConnection` pair → `createMediaStreamSource(remoteStream)` directly on the
raw `pc2.ontrack` stream → `ScriptProcessorNode`). Result: **`maxAbs: 0`** for channelCount 1, 2,
AND the unconstrained baseline that P3-LIVE-05 previously reported as working (`maxAbs≈1.075`).

This is the real finding: P3-LIVE-05's isolation test (which DID get signal) attached the raw
stream to a **playing `<audio>` element** first, then `captureStream()`'d that element.
`startRawRemoteStreamCapture` (P3-LIVE-06) skips that step — it calls
`createMediaStreamSource()` directly on the raw stream from `sfuRemoteStreams`, with no element
ever playing it. **That was never actually isolated in P3-LIVE-06** — I assumed "single-hop" was
sufficient because P3-LIVE-04/05's single-hop tests worked, without noticing they all went through
a playing element first. Confirmed by adding the missing step back into this exact test: attach
`remoteStream` to a **dedicated, harness-owned** `<audio>` element (not the app's
`data-remote-audio` one — avoids re-introducing the P3-LIVE-06 double-AudioContext-hop bug),
`.play()` it, THEN `captureStream()` that element → **`maxAbs: 1.075` for mono, stereo, AND
baseline, identically.** Stereo/mono makes no difference once this step is present.

**Root cause, finally**: Chromium does not decode/render a remote WebRTC audio track — even one
reporting `readyState:"live", enabled:true, muted:false` — unless it's attached to something that
actively plays it. `createMediaStreamSource()` alone, with no playing sink anywhere, is a silent
no-op tap. Every other diagnosis this run (SFU delivery, PipeWire source, AGC/NS/EC, double-hop)
was correct and real, but the LAST bug was in our own P3-LIVE-06 capture code, not the app or the
network.

## Fix (smallest proven change)

`dom-audio-capture.ts`'s `startRawRemoteStreamCapture()`: before building the capture graph,
create a dedicated `<audio>` element (harness-owned, not `data-remote-audio` — sidesteps the
app's own gain/compressor graph, keeping P3-LIVE-06's double-hop fix intact), set its `srcObject`
to the raw stream from `sfuRemoteStreams`, `.play()` it, then `captureStream()` THAT element and
feed the result into the existing `ScriptProcessorNode` graph (unchanged). No product/app code
touched — purely a `dom-audio-capture.ts` fix. `startDomRemoteAudioCapture` (the original
app-element path, still broken by the double-hop bug) is left as-is/unused, matching prior
batches' precedent of keeping disproven-but-documented code for the record.

## Verification

Re-run the P3-LIVE-07 smoke (copy → `p3-live-08-smoke.ts`) unchanged except for this
`dom-audio-capture.ts` fix — same `remap-source` + null-sink + `e2eDisableAudioProcessing=1` +
raw-stream capture path, just with the element-attach step added. `acceptanceAttempt:false`. PASS
= both publish + `rms>0`. Evidence → `validation/p3-live-08-evidence/`.

## Scope

Harness-only (`dom-audio-capture.ts`), no product/app code, no `ng build` needed. `free -h`
checked before live launch.

Awaiting APPROVED-PLAN before implementing.

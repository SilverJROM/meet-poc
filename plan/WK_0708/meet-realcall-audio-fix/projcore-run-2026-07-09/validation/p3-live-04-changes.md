# P3-LIVE-04 changes.md

## Summary

Batch requirement: "One PASS live split-host SFU smoke — both publish + receive-side WAV with
voiced energy."

**STATUS: BLOCKED.** The DOM `captureStream()` mechanism (this batch's approved primary approach)
is implemented, works end-to-end mechanically (element found, stream tapped, samples collected,
WAV encoded, no crash), and both call legs publish live (server-confirmed, same as prior batches)
— but the captured WAV is **exact digital silence** (0/262144 samples nonzero, confirmed by
independently parsing the WAV's PCM data, not just trusting the reported `rms`). Root-caused to a
plausible, well-evidenced new lead: `.140` (the machine hosting the local/receiving browser) has
**no audio backend installed at all** (`pactl`/`pipewire`/`pulseaudio` — none present, only client
libraries). Full narrative + evidence: `decisions/2026-07-10-p3-live-02-invalid-no-pc.md`
(2026-07-10 — P3-LIVE-04 section, appended).

## What works (shipped)

- `e2e/harness/dom-audio-capture.ts` (new): `startDomRemoteAudioCapture`/
  `stopDomRemoteAudioCapture` — taps the app's own `audio[data-remote-audio]` playback element via
  `HTMLMediaElement.captureStream()`, entirely bypassing `window.RTCPeerConnection` (sidesteps
  P3-LIVE-02/03's still-unexplained ctor-hook reset). Fail-closed: throws
  `DOM_CAPTURE_<reason>` on missing element/track/samples — no silent success path.
  - Found and fixed a real bug during first live run: `btoa(String.fromCharCode(...bytes))` blows
    the JS call-stack argument limit for anything beyond ~1-2s of audio (a `RangeError: Maximum
    call stack size exceeded` on ~262k samples). Fixed with chunked `String.fromCharCode.apply`
    (8192-byte chunks). Confirmed fixed: second run completed with no crash.
- `e2e/harness/p3-live-04-smoke.ts` (new): same split-host setup as `p3-live-02-smoke.ts`
  (`launchRemoteChrome` headless on .123, `loadRemoteVirtualMic`/`unloadRemoteVirtualMic`,
  `startRemoteSpeechLoop`), `joinDualBrowserCallSplitHost` called WITHOUT
  `recordReceiveSide`/`receiverPageIndex` (avoids the blocked ctor-hook path entirely), DOM
  capture driven from `onLive({page1})`. Both runs: both legs published
  (`speaker1.publishedBytes>0`, `speaker2.publishedBytes>0`), room deleted inline (HTTP 200 both
  times — no leak this time, unlike P3-LIVE-02/03's throw-before-cleanup gap), remote chrome +
  tunnel + remap-source module torn down cleanly.

## What's still blocked: captured audio is silent, not just quiet

Element/track diagnostics at capture time (added mid-batch, second run) show everything reporting
healthy: `{muted:false, volume:1, paused:false, readyState:4 (HAVE_ENOUGH_DATA), trackReadyState:
"live", trackEnabled:true, trackMuted:false}`. `audioContextState:"running"`, 64 `onaudioprocess`
callbacks fired, 262144 samples collected — the whole pipeline runs, it just carries zero energy
throughout.

Isolated the variable with a **local-only, no-SFU, no-.123** micro-test (deleted after use): built
a real oscillator tone → `MediaStreamDestination` → `<audio srcObject>` → `captureStream()`, same
code shape as `dom-audio-capture.ts`. Ran under **both** headless and Xvfb+non-headless Chrome on
`.140`: **both got real signal** (`maxAbs≈1.0` in both, not silence). This rules out "headless
can't captureStream" as an explanation (same negative result as P3-LIVE-02's Xvfb finding, but for
a different subsystem) — the synthetic-source case works fine either way.

The difference between that synthetic test and the real one: the real `<audio data-remote-audio>`
element's `srcObject` is backed by an actual **remote WebRTC track**, not a `MediaStreamDestination`
Web Audio node. Checked whether `.140` (where the local/receiving browser always launches —
hardcoded `headless:true` in `call-driver.ts`, independent of the remote leg's headless state) has
any real audio output backend: `pactl`/`pipewire`/`pulseaudio` — **none installed**, only client
libraries (`libpulse0`, `libpipewire-0.3-0`). Leading hypothesis: Chromium's audio-rendering
pipeline for a genuine `<audio>` element (as opposed to a pure in-graph `MediaStreamDestination`,
which never touches the OS audio backend) needs *some* functioning system audio sink to actually
pull/render samples, and on a machine with none, that pipeline silently starves — the element
reports "playing" and "not muted" throughout (matching what was observed), but nothing actually
flows through it. Not proven with instrumentation beyond this circumstantial evidence — a
hypothesis for whoever continues, not a conclusion.

## No app code touched

`git status --short frontend/ backend/`: empty. Everything this batch is confined to
`e2e/harness/` (two new files) + `plan/` docs.

## Calls / cleanup

- 2 live smoke attempts (`acceptanceAttempt:false`, `purpose:"smoke"`); `callBurnCount` unchanged
  at 0. Both rooms (`5699574b9ef7`, `a7a300c974bd`) deleted inline by the script itself (HTTP 200
  each) — unlike P3-LIVE-02/03, this path doesn't throw past the cleanup step, so no manual
  room cleanup was needed this batch.
- 1 orphaned room from the pre-bugfix crashed run (`a12a8b5a92d7`, before the base64-chunking fix)
  manually deleted via the harness API (verified `canDelete()` true first).
- Local-only synthetic captureStream micro-test: no rooms, no .123, no SFU — pure Playwright/Chrome,
  deleted after use, no ledger impact.
- Remote (.123): no leftover chrome/Xvfb, remap-source module unloaded, default-source restored.
- Local (.140): no leftover chrome/Xvfb processes from any of this batch's tests.
- `free -h` checked before both live launches (17-29Gi avail, both well above the 2Gi floor).

## Recommendation for the next batch

Two candidate directions, neither attempted here (out of this batch's approved scope — would need
its own PROPOSED+APPROVED given the environment-change or architecture-change size):
1. Install a minimal PulseAudio (or PipeWire) server with a null/dummy sink on `.140`, so Chrome
   has *something* to render `<audio>` playback to. Testable in isolation before touching the live
   smoke: rerun the local-only oscillator-via-loopback-RTCPeerConnection micro-test (not the
   synthetic `MediaStreamDestination` one — needs a real two-PC loopback so the element's
   `srcObject` really is WebRTC-track-backed) with a null sink present, see if `maxAbs` stays
   nonzero.
2. Restructure so the RECEIVING/capturing browser runs via CDP on `.123` (which has a real,
   confirmed-working PipeWire audio backend) instead of always-local-on-`.140`
   (`call-driver.ts`'s `chromium.launch` is currently hardcoded to the local host for what becomes
   `page1`) — a bigger structural change to the split-host topology, not a small patch.

Reporting BLOCKED, not DONE, per this run's real-call-acceptance standard (a silent WAV is not
"receive energy," regardless of how clean the surrounding mechanism is).

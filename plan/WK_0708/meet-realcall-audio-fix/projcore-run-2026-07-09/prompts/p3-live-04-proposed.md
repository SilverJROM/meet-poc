# P3-LIVE-04 PROPOSED plan

## Mechanism choice: DOM audio-element capture (primary approach, not the CDP backup)

Bypasses `window.RTCPeerConnection` entirely — no constructor wrap, so P3-LIVE-02/03's
still-unexplained mid-call reset (not zone.js, not defeated by `defineProperty` locking, not a
reload/crash/iframe) cannot touch it.

**How:** `frontend/src/app/services/remote-audio.service.ts:559-564` (`addPublisher()`) is
first-party, stable product code — for every remote publisher the app creates
`document.createElement('audio')`, tags it `el.dataset['remoteAudio'] = id` (i.e.
`<audio data-remote-audio="...">`), and sets `el.srcObject` to the live remote `MediaStream`. This
element exists and plays regardless of how/when we hooked (or failed to hook) the underlying PC.
`HTMLMediaElement.captureStream()` — a native browser API, not app code — re-taps whatever is
actually flowing through that element into a fresh `MediaStream`, which we feed into the same
Web Audio (`AudioContext` → `createMediaStreamSource` → `ScriptProcessorNode`) sample-collection
pattern `receive-side-recorder.ts` already uses, then encode via the existing `WavEncoder`.

## Files

- **New** `e2e/harness/dom-audio-capture.ts`: `startDomRemoteAudioCapture(page, outputDir,
  timeoutMs)` (polls for `audio[data-remote-audio]` with a live `srcObject`, taps it via
  `captureStream()`, installs the sample-collection graph) / `stopDomRemoteAudioCapture(handle)`
  (reads accumulated samples, encodes WAV, computes rms, writes `.wav`+`.meta.json`). Fails closed
  (throws `DOM_CAPTURE_<reason>`) on: element never appears, no `captureStream` support, no audio
  track, zero samples captured — no silent success path.
- **New** `e2e/harness/p3-live-04-smoke.ts`: same split-host setup as `p3-live-02-smoke.ts`
  (`launchRemoteChrome` headless, `loadRemoteVirtualMic`/`unloadRemoteVirtualMic`,
  `startRemoteSpeechLoop`), but calls `joinDualBrowserCallSplitHost` WITHOUT
  `recordReceiveSide`/`receiverPageIndex` at all (avoids the blocked ctor-hook path completely) —
  DOM capture is driven directly from `onLive({page1})`: install capture, dwell 6s, stop+encode.
  Evidence → `validation/p3-live-04-evidence/`.
- **No changes** to `receive-side-recorder.ts` or `call-driver.ts` — the existing
  `recordReceiveSide`/`receiverPageIndex` machinery is left exactly as-is (still broken for the
  split-host path, still owned by its own decision doc; not this batch's problem to fix, since the
  bypass makes it moot for THIS acceptance bar).

## Risk / why this should work where the ctor hook didn't

- Doesn't depend on WHEN or WHY `window.RTCPeerConnection` gets reset — never touches that global.
- `captureStream()` is a standard, long-shipped Chromium API (no flag needed); Chrome on .123 stays
  headless (same as the audioinput fix — no Xvfb).
- `data-remote-audio` is real product code (not a harness guess) — grepped and read directly from
  `remote-audio.service.ts`, not inferred.
- Known limitation, disclosed not hidden: this proves receive ENERGY (rms>0, mirrors what's
  actually playing through the app's own audio pipeline — post-AGC/gain, exactly what a human ear
  would hear) but does not itself prove which underlying PC/track produced it, unlike the ctor-hook
  approach's per-track tap. For THIS batch's acceptance bar (publish + receive energy, not
  per-track attribution), that's sufficient and arguably more representative (captures the actual
  played-out audio, gain/AGC included).

## Acceptance check

PASS = `result.speaker1.publishedBytes > 0 && result.speaker2.publishedBytes > 0` (both legs, same
gate as P3-LIVE-01/02/03) AND the DOM-captured WAV has `rms > 0` (voiced energy, not digital
silence) — written to `validation/p3-live-04-evidence/`. `acceptanceAttempt:false` throughout, no
CAP burn. Room deleted inline via existing `canDelete()` gate (same as prior batches — the
room-DELETE-on-throw gap flagged in P3-LIVE-02's decision doc is a `call-driver.ts` issue,
independent of this bypass; if it recurs on a capture-side throw here I'll clean up manually and
note it, same as before, not silently paper over it).

## Backup not used

The CDP `Target`/`Runtime.executionContextCreated` instrumentation route (this batch's backup
option) is not needed if the DOM-capture primary approach reaches PASS — held in reserve only if
`captureStream()` turns out to be unavailable or the element/track never appears live.

Awaiting APPROVED-PLAN before running live against .123.

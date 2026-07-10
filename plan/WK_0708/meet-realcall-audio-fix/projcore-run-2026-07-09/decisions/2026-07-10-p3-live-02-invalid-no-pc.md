# 2026-07-10 — P3-LIVE-02: new downstream blocker after the audioinput fix (INVALID_NO_PC)

## What this batch was asked to fix, and did fix

P3-LIVE-01 (666fd22) was FAIL/BLOCKED because headless Chrome on .123 reported 0 audioinput
devices via `enumerateDevices()`. The brief's recommendation was to try Xvfb + non-headless Chrome.

**That hypothesis is disproven, empirically, both ways:**
- Headless Chrome, unmodified: `enumerateDevices()` → 0 audioinput, `getUserMedia({audio:true})` →
  `NotFoundError`.
- Xvfb :99 + non-headless Chrome, identical PipeWire routing: **same result** — 0 audioinput, same
  `NotFoundError`. Chrome's own verbose audio-manager log shows the miss happens inside
  `DeviceEnum::GetAudioInputDeviceDescriptions` in the PulseAudio backend, before any
  renderer/compositor code runs. Headless-vs-windowed is not the variable.

**Real cause:** .123's only "virtual mic" route is the PipeWire monitor-of-sink
(`alsa_output...iec958-stereo.monitor`, `device.class=monitor`). Chrome's PulseAudio input
enumeration excludes `device.class=monitor` sources categorically (by design — a page must not
silently capture system audio via the mic permission). The one real ALSA input on the box
(`alsa_input...analog-stereo`) never surfaces either (all its ports report hardware-jack
`not available` — no physical mic wired to this box).

**Fix, proven both headless and non-headless:**
```
pactl load-module module-remap-source master=<monitor-source> source_name=virtual_mic \
  source_properties=device.description=VirtualMic
pactl set-default-source virtual_mic
```
`module-remap-source` creates a *new* source wrapping the monitor that reports
`device.class=filter`, `Monitor of Sink: n/a` — not `monitor` — so Chrome's filter no longer excludes
it. Confirmed: `enumerateDevices()` lists 2 audioinput (`Default`, `VirtualMic`),
`getUserMedia({audio:true})` → `{ok:true}`, under **plain headless** Chrome. Xvfb is unnecessary.
Landed as `loadRemoteVirtualMic`/`unloadRemoteVirtualMic` in `e2e/harness/remote-cdp-host.ts`, wired
into `e2e/harness/p3-live-02-smoke.ts` (headless launch, unchanged from P3-LIVE-01's
`launchRemoteChrome`).

## What's still blocked: receive-side capture sees zero RTCPeerConnections

With the audioinput fix in place, `p3-live-02-smoke.ts` gets much further than P3-LIVE-01 ever did:
both bot-140 (local) and bot-123 (real-virtual-mic over CDP) **join and publish successfully** —
confirmed server-side (`backend/logs`: `sfu-publish` for both peers) and client-side
(`joinDualBrowserCallSplitHost`'s own `waitForPublishedAudioBytes` gate passes for both legs, or the
call would have thrown "Publishing validation failed" before ever reaching receive-side recording).

It then throws `INVALID_NO_PC` from `receive-side-recorder.ts:stopAndEncodeCapture` — the injected
capture hook (`installCaptureHook`, an `addInitScript`-based `window.RTCPeerConnection` wrapper)
reports `pcCount: 0` on page1 (bot-140, the local receiver) even though bot-140 is, by the app's own
telemetry, running a live, publishing `RTCPeerConnection`.

Reproduced and narrowed live (5 rooms, all cleaned up, 0 acceptance burns — `purpose:"smoke"`,
`acceptanceAttempt:false` throughout, `callBurnCount` stayed 0):
- **Not a reload/SPA-routing false-positive** (the B08A-3/716d6d1/B00S-RELOAD failure mode): the
  out-of-page `getDocumentLoadCount(page1)` stayed `1` in every run — no second real document load
  fired. `state.installed: true` and `hasHook: true` confirm the hook DID install on `about:blank`
  before navigation, per its own ordering guard.
- Directly evaluated on `page1` ~3–6s into the call: `window.RTCPeerConnection` is back to
  `function RTCPeerConnection() { [native code] }` — the **native** constructor, not the hook's
  wrapper — while `__b08s2ReceiveCapture` (the hook's own state object, installed earlier) is still
  present with `pcCount: 0`. Manually constructing `new window.RTCPeerConnection({})` at that point
  succeeds but does **not** increment `pcCount`, confirming the live global has been reverted to
  native sometime between hook-install (works) and mid-call (native again) — not a hook-logic bug,
  but something in the page's own script execution restoring the original constructor reference
  after our `addInitScript` override applied.
- The app frontend uses `zone.js` as an Angular polyfill (`frontend/angular.json:18`), which is
  known to monkey-patch `RTCPeerConnection` itself (`webapis-rtc-peer-connection` zone patch) via a
  pattern that captures "the current global" and reinstalls its own wrapper. That is the leading
  suspect for what clobbers our override, but this was not proven beyond the observation above —
  flagging as the starting point for whoever picks this up, not a conclusion.

This is **new**: P3-LIVE-01 never reached this code path at all (it died at 0-audioinput before any
real join happened), so this is the first time the split-host topology has exercised receive-side
recording end-to-end. B08A-3's own live receive-side proof (3150f08, WAV `rms>0`) was a **fully
local** dual-browser call (`joinDualBrowserCall`, not the CDP split-host `joinDualBrowserCallSplitHost`
path) — so it never hit whatever is different here.

## Also discovered, smaller: room leaks on this failure path

`joinDualBrowserCallSplitHost`'s room-`DELETE` cleanup only runs after a successful return value —
if `stopReceiveSideRecording` throws (as it does here), the function's `finally` block closes
browsers/pages but the room itself is never deleted (no `roomId` is surfaced to the caller on
throw). Hit this 4 times this batch; all 4 rooms manually deleted via the harness API afterward
(`0543c4da1119`, `373f20cc9097`, `255b17eaee2e`, `17d7fe90d40f`, plus one from the pre-dwell run,
`f9c4b6a2517b`) — verified `canDelete()` true (harness-registered, non-protected) before each
delete, `TEST_ROOM01`/`652c1475` untouched. Not fixed here — `createRoom`/the room lifecycle is
shared `call-driver.ts` surface used by every other batch; changing its error-path contract is out
of this batch's harness/env-only scope and needs its own review.

## Recommendation (as of P3-LIVE-02)

A follow-on batch is needed to either (a) find and neutralize whatever restores
`window.RTCPeerConnection` to native mid-call (zone.js patch ordering is the lead), or (b) move the
capture hook to a mechanism zone.js can't unwind (e.g. hooking at the `RTCPeerConnection.prototype`
level instead of reassigning the global constructor, since prototype-level patches survive a
constructor-reference swap). Until then, P3-LIVE-02's second acceptance clause ("receive energy")
cannot pass — reporting BLOCKED, not DONE, per this run's real-call-acceptance standard (no
false-green).

## 2026-07-10 — P3-LIVE-03 follow-up: the zone.js lead is DISPROVEN; still unresolved

Tested two mechanism-level fixes live against .123, both failed to change the outcome —
`pcCount` stayed `0` in every run:

1. **zone.js's own RTC patch is not even loaded.** Read
   `node_modules/zone.js/fesm2015/webapis-rtc-peer-connection.js` directly: it only patches
   `RTCPeerConnection.prototype.addEventListener`/`removeEventListener` for zone-aware event
   dispatch — it never reassigns `global['RTCPeerConnection']` at all, so even if it ran it
   couldn't produce what we observed (the *constructor itself* reverting to native). Confirmed via
   `frontend/src/main.ts`/`angular.json` that only the bare `zone.js` polyfill is imported — this
   plugin file isn't referenced anywhere in first-party source. No `webrtc-adapter` or similar
   dependency exists either (`grep` for both across `frontend/`: no hits). **The zone.js hypothesis
   from the P3-LIVE-02 writeup above is dropped.**
2. **`Object.defineProperty(window, 'RTCPeerConnection', {value, writable:false,
   configurable:false})`** in `installCaptureHook` (tested live, reverted after — not shipped since
   it didn't work): still ended up with `pcCount:0` and, more tellingly, re-reading the property
   descriptor mid-call showed `{writable:true, configurable:true}` again — i.e. not just the *value*
   but the **descriptor itself** was back to pristine native defaults. A plain script-level
   reassignment against a `configurable:false` property either throws (strict mode) or silently
   no-ops (sloppy mode) — neither can change `writable`/`configurable` back to `true`. Only a fresh
   application of the native binding to that property name can produce this, in JS-legal terms.

Ruled out by direct instrumentation on the same runs (`getDocumentLoadCount` from
`receive-side-recorder.ts`, `page.on('crash')`, `page.frames()`):
- **Not a reload**: `documentLoadCount` stayed `1` throughout (confirmed again this batch).
- **Not a renderer crash**: `page.on('crash')` never fired.
- **Not an iframe/extra frame**: `page.frames().length === 1`, same room URL, every time.

Found the actual `new RTCPeerConnection(...)` call sites in the **shipped, built** bundle
(`frontend/dist/meet-poc-frontend/browser/`, not source — grepped the dist output directly since
that's what the browser actually runs): `chunk-UALHZ66O.js` has the real SFU client's
`this.pc = new RTCPeerConnection(...)` (matches `sfu-client.service.ts:2186`), and
**`chunk-TUJLC4SH.js` has a second, earlier one** — a TURN-relay reachability prober
(`typeof RTCPeerConnection>"u"` feature-detect, then `new RTCPeerConnection({iceServers:s,
iceTransportPolicy:"relay"})` to time a relay-candidate probe) that runs during ICE-server setup,
**before** the SFU client's own PC. Neither call site incremented `pcCount` in any run — meaning
whatever reverts the global has already happened by the time even this early TURN prober runs, i.e.
very early in the app's bootstrap, not at some later "second participant joined" moment.

**Still unresolved.** Every explanation that fits "some script reassigns the property" is either
ruled out (zone.js, iframe, reload, crash) or contradicted (defineProperty-lock doesn't survive,
which a simple reassignment could never defeat). The remaining candidate is something outside
normal single-realm JS semantics — e.g. a Chromium renderer-process swap that resets the V8 isolate
(and therefore both our closure state and the property descriptor) without firing a Playwright/CDP
navigation event, possibly triggered by the real getUserMedia permission grant on a CDP-attached
target. This would also explain why `__b08s2ReceiveCapture` intermittently *does* still read as
`{pcCount:0}` (a **fresh** copy from `addInitScript` re-running on the new isolate, since CDP's
`Page.addScriptToEvaluateOnNewDocument` is specifically documented to survive exactly this kind of
per-target JS-context recreation) rather than `undefined` (which a lost registration would give).
Not proven — a hypothesis for whoever picks this up next, requiring CDP-level instrumentation
(`Target.attachedToTarget`, `Runtime.executionContextCreated` counts) that's beyond what
`page.evaluate`/Playwright's own event surface can observe.

**STATUS: still BLOCKED.** No mechanism-level fix found or shipped this batch; nothing in
`receive-side-recorder.ts` was changed (the `defineProperty` experiment was reverted after
disproving itself). Full run evidence: `validation/p3-live-03-changes.md`.

## 2026-07-10 — P3-LIVE-04: ctor-hook bypassed entirely (DOM captureStream); still silent

Took the "different mechanism" fork instead of chasing the ctor-hook mystery further: built
`e2e/harness/dom-audio-capture.ts`, which never touches `window.RTCPeerConnection` at all. The app
itself (first-party, `remote-audio.service.ts:559-564`) creates
`<audio data-remote-audio="<id>">` per remote publisher and sets its `srcObject` to the live remote
`MediaStream` — that's a stable selector into real product code, not a harness assumption.
`HTMLMediaElement.captureStream()` re-taps whatever's actually flowing through that element,
independent of when/how the underlying `RTCPeerConnection` was constructed.

**Result: mechanically this works, but the audio is silent.** Both call legs published live
(server-confirmed, same gate as every prior P3-LIVE batch). The DOM element was found, `.srcObject`
was live, `captureStream()` succeeded, the Web Audio graph ran (64 `onaudioprocess` callbacks,
262144 samples, `audioContextState:"running"`) — and every single sample was exact zero (verified
by parsing the WAV's raw PCM directly, not by trusting the reported `rms`). Element/track
diagnostics all read healthy at capture time: `muted:false, volume:1, paused:false,
readyState:4, trackReadyState:"live", trackEnabled:true, trackMuted:false`. The pipeline runs; it
just carries no energy.

**Isolated the variable, cheaply, with no SFU/no .123 involved:** a local-only micro-test (real
oscillator → `MediaStreamDestination` → `<audio srcObject>` → `captureStream()`) got real signal
(`maxAbs≈1.0`) under **both headless and Xvfb+non-headless** Chrome on `.140` — ruling out
"headless can't captureStream" (the P3-LIVE-02 Xvfb finding, but for the output/rendering side
this time, not audioinput). The difference from the real, silent case: the real element's
`srcObject` is backed by an actual remote WebRTC track, not a `MediaStreamDestination` node.

**Leading hypothesis (not proven):** `.140` — where the local/receiving browser always launches;
`call-driver.ts`'s `chromium.launch()` for what becomes `page1` is hardcoded to the local host,
independent of the remote leg's headless-ness — has **no audio backend installed at all**:
`pactl`/`pipewire`/`pulseaudio` absent entirely, only client libraries (`libpulse0`,
`libpipewire-0.3-0`) present. A genuine `<audio>` element's Chromium render pipeline may need *some*
functioning OS audio sink to actually pull/render samples, unlike a pure in-graph
`MediaStreamDestination` (which never touches the OS audio backend and is exactly why the synthetic
test above didn't reproduce the silence). Circumstantial, not instrumented — flagging as the next
lead, not a conclusion.

Found and fixed one real bug along the way (shipped, in `dom-audio-capture.ts`): the first live
run crashed with `RangeError: Maximum call stack size exceeded` from
`btoa(String.fromCharCode(...bytes))` — spreading ~262k array elements as individual function
arguments blows the JS engine's argument-count limit. Fixed with chunked
`String.fromCharCode.apply` (8192-byte chunks); confirmed fixed on the second run (no crash).

**Two candidate next directions**, neither attempted (each needs its own PROPOSED+APPROVED —
either an environment change or a topology change, bigger than this batch's scope):
1. Install a minimal PulseAudio/PipeWire null-sink on `.140` so Chrome has something to render
   `<audio>` playback to; verify with a real two-PC loopback micro-test (not the synthetic
   `MediaStreamDestination` one) before touching the live smoke again.
2. Move the receiving/capturing browser to run via CDP on `.123` (confirmed-working real PipeWire
   audio) instead of always-local-on-`.140` — a bigger split-host topology restructure.

**STATUS: still BLOCKED.** `frontend/`/`backend/` untouched. Two new harness files shipped
(`dom-audio-capture.ts`, `p3-live-04-smoke.ts`) — both mechanically sound, proven end-to-end except
for the silence itself. Full run evidence: `validation/p3-live-04-changes.md`.

## 2026-07-10 — P3-LIVE-05: null-sink installed and PROVEN to work, but the live smoke reveals a different, deeper cause

Took candidate direction 1 from above: installed PulseAudio (`sudo apt-get install -y pulseaudio
pulseaudio-utils`) on `.140` as a **per-user systemd --user daemon** (not a system-wide service),
started via `systemctl --user start pulseaudio.socket`. PulseAudio auto-created its own
hardware-fallback null sink (`auto_null`) since the box has no real sound card — no manual
`module-null-sink` load needed.

**Isolation test first (no SFU, no .123), as required before touching the live call:** a real
two-`RTCPeerConnection` loopback (fake-device mic → offer/answer → remote track) feeding a genuine
`<audio srcObject>` element, then `captureStream()`'d — **got real signal, `maxAbs≈1.075`**,
where the exact same shape of test (this time via a `MediaStreamDestination`, not a real WebRTC
track) had already worked pre-null-sink in P3-LIVE-04. This is the FIRST time a real-WebRTC-track
`captureStream()` produced non-zero samples on `.140`. The null-sink hypothesis is **confirmed
correct for the general case.**

**But the full live split-host smoke (re-run twice) still returns exact silence.** Both legs
publish live (same server-confirmed gate as every prior batch); the DOM capture mechanism runs
clean (element found, healthy diagnostics). New this batch: queried the app's own instrumentation
(`window.__meetDebug.remoteAudioMixer.debugSnapshot()`, real product code,
`remote-audio.service.ts:476-495`) at the moment of the silent capture:
`contextState:"running"` (not suspended — the AudioContext genuinely is running), `unlocked:true`,
`outputAttached:true`, `outputPaused:false` — but the one active peer is in `blockedPeerIds`, and
`voiceRecoveryCounters.resume:1` shows the app already attempted a recovery action during the 6s
dwell. Traced `remoteAudioBlockingReason()` (`remote-audio.service.ts:821-827`): with `el.paused`
confirmed false, the only fit is `voice-stalled`, set via `markVoiceStalled()` from
`observeRemoteVoiceTrack()`/`decideRemoteVoiceWatchdogAction()` (`room.page.ts:3195-3234`) — a
watchdog driven by **inbound SFU stats** (packets/bytes actually received on `page1`), not by
local rendering/captureStream at all.

**This reframes the problem.** The audio-backend fix works (proven) but isn't sufficient — the
app's own stats-based watchdog independently flags this peer's inbound audio as stalled, which
points at whether real RTP packets are reliably arriving at `page1` from `bot-123`'s real-mic leg
on this split-host topology at all, not at local playback/capture rendering. That's an SFU/media-
relay question, outside this batch's "env + harness smoke only" scope (no backend/product code
touched, per the brief's own gate) — flagging as the concrete next investigation:
sample `__meetDebug.sfuGetStats()` inbound-audio `packetsReceived`/`bytesReceived` **deltas over
the dwell window** (not just the sending side's published-bytes, already confirmed nonzero every
batch) to see whether inbound stats advance at all.

**STATUS: still BLOCKED**, but genuine progress: the audio-backend environment fix is installed,
verified, and left in place for future batches (isolation test proves it's correct); the remaining
blocker has a much narrower, concrete next question than "why is it silent." `frontend/`/`backend/`
untouched. Full run evidence: `validation/p3-live-05-changes.md`.

## 2026-07-10 — P3-LIVE-06: inbound RTP proven to advance; traced to Chrome's own AGC/NS/EC on bot-123's capture

Answered the exact question P3-LIVE-05 posed. Sampled `inbound-rtp` audio stats on page1 (t0/t1
around the dwell, same `RTCStatsReport` shape `call-driver.ts`'s existing
`sampleOutboundAudioBytes()` uses) and cross-sampled page2's outbound stats over the identical
window, three live runs: **inbound `packetsReceived`/`bytesReceived` advance in near-1:1 lockstep
with bot-123's outbound** (e.g. Δ303 packets in vs Δ304 out, Δ41160 bytes in vs Δ41320 out over
~5.3s). **The SFU/media-relay is not the blocker** — real RTP audio is reliably delivered on this
split-host topology.

**Found and fixed a real, separate bug along the way** (isolated locally, zero SFU/`.123`
involvement): the app's own `remote-audio.service.ts:730-751` feeds `<audio data-remote-audio>`
elements from its **own** `AudioContext` (gain → compressor → `createMediaStreamDestination()`),
not the raw stream — so `dom-audio-capture.ts`'s `captureStream()`-on-that-element taps one
AudioContext's output from a **second**, independent AudioContext. A synthetic two-hop
reproduction (loopback mic → app-shaped gain/compressor graph → element → `captureStream()` →
second context) got `maxAbs: 0` with everything else (context states, element pause/mute, track
`live`) reporting healthy — exactly the P3-LIVE-04/05 symptom, reproduced with zero network
involvement. Every prior isolation test was single-hop (raw stream straight into one context) and
worked; this is Chromium-specific fragility in double-hop `MediaStreamDestination` →
`captureStream()` chaining. **Shipped the fix**: `startRawRemoteStreamCapture()` (new,
`dom-audio-capture.ts`) taps `window.__meetDebug.sfuRemoteStreams` (real product code,
`sfu-client.service.ts:114`) directly, bypassing the app's own graph and the double-hop entirely.

**Still exact silence with the fix applied, live.** Went one layer further: verified real signal
exists at the PipeWire source itself, ground-truth, with **zero Chrome/WebRTC involvement** —
`scp`'d the speech WAV to `.123`, ran the harness's own `paplay` loop, and recorded straight off
`virtual_mic` with `parecord`. Result: real signal (139710/196608 nonzero samples, max amplitude
18564/32767). The signal genuinely exists before Chrome ever touches it.

**Then checked what Chrome does to it on capture**: read `getSettings()`/`getConstraints()` on
bot-123's actual captured `MediaStreamTrack` (`window.__meetDebug.localStream`, real product code,
`room.page.ts:606`) during the same live run. Result:
**`autoGainControl: true, echoCancellation: true, noiseSuppression: true`** — all three enabled,
confirmed on the exact track for this exact call. Chrome's noise-suppression model is well known to
aggressively gate audio that doesn't match its "voice" heuristics — audio replayed through a
PipeWire monitor/remap loopback (rather than captured from a physical mic in a real room) is a
plausible case for that. This is now the leading, well-evidenced, narrow candidate for the
remaining silence: real signal → real transport → Chrome's own capture-side processing likely
suppresses it before encoding.

**Fixing this needs an app-level `getUserMedia` constraint override**
(`echoCancellation`/`noiseSuppression`/`autoGainControl: false` on the real-virtual-mic path) —
`media.service.ts` is untouched this batch; that's product code, out of "harness + diagnostics
first; topology/env fixes ok" scope without its own PROPOSED+APPROVED.

**STATUS: still BLOCKED**, but the search space is now very narrow: SFU delivery ✔ proven fine,
PipeWire source signal ✔ proven real, double-hop capture bug ✔ found and fixed, and the one
remaining candidate (Chrome's AGC/NS/EC on the capture side) is concrete and directly testable —
whoever picks this up next just needs the constraint-override approved and can immediately verify
with the already-shipped `startRawRemoteStreamCapture()`. `frontend/`/`backend/` untouched. Full
run evidence: `validation/p3-live-06-changes.md`.

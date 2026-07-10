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

## Recommendation

A follow-on batch is needed to either (a) find and neutralize whatever restores
`window.RTCPeerConnection` to native mid-call (zone.js patch ordering is the lead), or (b) move the
capture hook to a mechanism zone.js can't unwind (e.g. hooking at the `RTCPeerConnection.prototype`
level instead of reassigning the global constructor, since prototype-level patches survive a
constructor-reference swap). Until then, P3-LIVE-02's second acceptance clause ("receive energy")
cannot pass — reporting BLOCKED, not DONE, per this run's real-call-acceptance standard (no
false-green).

# Phase B — Sonnet (2026-06-08)
## T1 telemetry-replay plan (per signature: inject → assert)

Decision logic under test: `voiceRecoveryWindowExhaustedWhileStalled` (remote-audio.service.ts:95),
`RemoteAudioService.addPublisher/watchdog` (service.ts:450/324), `sfu-client.service.ts subscribeIfNeeded` (165),
`buildDiagnosticsPayload` / `playoutDiagnostics` (service.ts:397).

| # | Signature (sessions) | Tier | Inject | Assert |
|---|----------------------|------|--------|--------|
| 1 | **inbound-audio-recv-no-audioLevel/energy** (30) | T1+T2 | `getStats` sequence: 30 samples, `audioLevel=null, totalAudioEnergy=null` on inbound-rtp track while element `paused=false, srcObjectAttached=true` | `voiceRecoveryWindowExhaustedWhileStalled(input)===true`; watchdog fires `recoverVoicePlayout`; B16 payload has `remoteAudioBlocked=true` or watchdog step logged |
| 2 | **inbound-audio-high-concealment** (27) | T1 | `getStats` inbound-rtp: `concealedSamples / totalSamplesReceived > 0.05` over 3 consecutive samples | diagnostics payload records `concealmentRatio`; no false-recovery triggered (high concealment alone ≠ stalled playout) |
| 3 | **inbound-audio-packet-loss** (17) | T1 | `getStats`: `packetsLost=50, packetsReceived=950` (5% loss) | peer `quality` degrades to `'poor'`; diagnostics `packetLossPct ≈ 5`; no spurious watchdog remediation |
| 4 | **relay-path-used** (9) | T1 | `selectedCandidateType='relay', relayUsed=true` in diagnostics payload | diagnostics entry persisted with `relayUsed=true`; no false ICE-failure triggered |
| 5 | **subscribe-stuck-no-firstframe** (4) | T1+T2 | Call `subscribeIfNeeded` with publisher; suppress `ontrack` event for `>SUBSCRIBE_STUCK_TIMEOUT_MS` | `subscribeStuckTimers` fires; `subscribeRetryVersion` increments; re-subscribe attempted (FIX2 — commit 0a0608e); assert NOT permanently stuck |
| 6 | **ws-reconnect** (4) | T1 | Emit WS close then open events; re-emit `admitted` with same sessionId | `wsReconnectAttempts` increments in diagnostics; peers re-added to registry; `addPublisher` called again for existing publishers; no duplicate elements (B14 reset clears first) |
| 7 | **ws-disconnect** (3) | T1 | Emit WS close only (no reconnect within window) | `wsStatus='disconnected'` in diagnostics payload; `remoteAudioBlocked` stays as-is (network loss ≠ playout blocked) |
| 8 | **one-inbound-audio-at-a-time ≥2 pubs never concurrent** (2) | T1+T2 | Call `addPublisher` for peers A, B, C simultaneously with distinct streams | registry has exactly 3 entries (one element per publisherClientId — B4 dedup); all 3 elements `paused=false`; no element with `srcObject=null`; calling `addPublisher(A, newStream)` replaces element without removing B/C |
| 9 | **high-RTT-intl ≥150ms** (2) | T1 | Diagnostics payload with `rttMs=200, relayUsed=true` (international path) | diagnostics API stores entry; FIX5 network-path readout present in response (owner-only, commit 2917b8b); no false-stalled detection from high RTT alone |
| 10 | **outbound-audio-0bytes** (1) | T1 | Outbound audio stats: `bytesSent=0, packetsSent=0` while `micEnabled=true, trackReadyState='live'` | diagnostics flags `outboundAudioSilent=true`; separate from inbound watchdog (no `recoverVoicePlayout` triggered for LOCAL mic silence) |
| 11 | **pc-state-bad: failed/failed** (1) | T1+T2 | Inject `connectionState='failed', iceConnectionState='failed'` on peer PC | FIX4 re-fetch relay path triggered (commit 8857d86); diagnostics records `connectionState='failed'`; recovery attempt logged; after recovery `addPublisher` re-subscribes (FIX2) |
| 12 | **publish-error** (1) | T1 | SFU `/sessions/new` returns error or network-level reject | error surfaced in diagnostics; `sfuDiagnostics.connectionState` not 'connected'; no silent drop; UI shows error state |
| 13 | **inbound-audio-recv-audioLevel-0** (1) | T1 | `getStats`: `audioLevel=0` (field PRESENT, explicit zero) sustained 10 samples | `voiceRecoveryWindowExhaustedWhileStalled` triggers — same as absent (zero energy IS stalled); confirm diagnostics distinguishes from `audioLevel=null` by presence of the field |

---

## T2 real-browser plan (per critical path: setup → assert, incl. parecord proof)

### Critical paths

**CP-1 — Sink routing (A4 fix validation; sigs 1, 8)**
Setup:
```bash
# Two null sinks
SINK1=$(pactl load-module module-null-sink sink_name=meet_sink_1 \
  sink_properties=device.description=MeetSink1)
SINK2=$(pactl load-module module-null-sink sink_name=meet_sink_2 \
  sink_properties=device.description=MeetSink2)
# Record monitors
parecord --device=meet_sink_1.monitor --file-format=wav /tmp/sink1.wav &
parecord --device=meet_sink_2.monitor --file-format=wav /tmp/sink2.wav &
```
Playwright test:
```ts
// host context: select MeetSink2 (non-default)
await hostPage.evaluate(() => audioOutputSelector.select('meet_sink_2'));
// guest context: join and speak (fake audio via wav)
// Chrome launch: --use-file-for-fake-audio-capture=e2e/fixtures/440hz-tone.wav
//                --use-fake-device-for-media-stream
```
Assert:
- `/tmp/sink2.wav` has non-silent frames (RMS > threshold) — audio reached the selected device
- `/tmp/sink1.wav` is silent — audio NOT on default device
- B13: element has NO `autoplay` attribute (check via `el.getAttribute('autoplay') === null`)
- B16 diagnostics payload: `sinkId === 'meet_sink_2', paused === false, srcObjectAttached === true`

**CP-2 — Concurrent multi-publisher audio (sig 8 fix)**
Setup: same null-sinks. Launch 3 browser contexts (host + 2 guests), all with fake audio capture (different wav files — 440hz, 880hz, 220hz).
Assert:
- Host's registry has 3 entries; all `paused=false`
- parecord on selected sink captures all 3 frequencies concurrently (FFT analysis or amplitude cross-check)
- addPublisher called 3× in < 200ms → no interleaving/override

**CP-3 — Subscribe-stuck recovery (sig 5)**
Playwright: intercept SFU `ontrack` event (via page.evaluate mock) to delay it 6s (>SUBSCRIBE_STUCK_TIMEOUT_MS).
Assert:
- `subscribeRetryVersion` > 0 (FIX2 re-subscribe fired)
- After unblocking mock, audio eventually plays
- diagnostics `subscribeLatencies` entry shows retry

**CP-4 — PC failed recovery (sig 11)**
Playwright: `page.evaluate(() => peer.pc.dispatchEvent(new Event('connectionstatechange')))` after setting mock state to 'failed'.
Assert:
- FIX4 relay re-fetch triggered
- Audio resumes within 10s of recovery
- diagnostics `connectionState` transitions logged

---

## Researched known-issues (top 12; all [from-knowledge])

| # | Name | 1-line test idea | Source | Severity (talk/record/see) |
|---|------|-----------------|--------|---------------------------|
| 1 | **Chrome setSinkId + play() order race** | Create element, play() first, then setSinkId; assert parecord shows first frames on default not selected | MDN HTMLMediaElement.setSinkId | talk: HIGH |
| 2 | **iOS Safari — no setSinkId** | Mobile-emulated context (iPhone UA + Safari UA string); assert `applyMediaElementSinkWithDefaultFallback` returns `'unsupported'`; no crash; banner not blocked | MDN compat table | talk: MED (iOS-only) |
| 3 | **Chrome autoplay policy (NotAllowedError)** | Launch with `--autoplay-policy=document-user-activation-required`; join room without click; assert `remoteAudioBlocked=true` + unlock banner renders | Chrome autoplay docs | talk: HIGH |
| 4 | **Android Chrome backgrounding** | Playwright `page.setHidden(true)` while call active; assert `recoverRemoteAudio('visibility')` fires and audio resumes on foreground | W3C Page Visibility API | talk: HIGH |
| 5 | **MediaRecorder frame gaps on background tab** | Start recording, hide tab for 5s, resume; assert recorded blob has no silent gap > 1s (frame continuity) | crbug WebRTC recording | record: HIGH |
| 6 | **devicechange race (headset unplug mid-call)** | Dispatch mock `devicechange` event with invalidated sinkId; assert B18 setSinkId timeout fires (≤2s); audio continues on default fallback | W3C Media Capture spec | talk: MED |
| 7 | **Opus DTX false-stalled diagnosis** | Inject DTX pattern (alternating zero-energy + concealment spikes, mimicking speech pauses); assert watchdog does NOT fire recovery during legitimate DTX silence | RFC 6716 §2.1.4 DTX | talk: MED (false positive) |
| 8 | **ICE restart TURN latency gap** | Inject iceConnectionState: failed→checking→connected transition; assert subscribeIfNeeded re-subscribes post-recovery; audio gap < 8s | RFC 8445 ICE restart | talk: HIGH |
| 9 | **AEC reference mismatch on non-default sink** | Host plays remote audio to test_sink_2; host mic captures from default; measure loopback via parecord on default.monitor — assert echo level < -40dB | Chrome AEC internals | talk: LOW (AEC software) |
| 10 | **Renegotiation glare (simultaneous offer)** | Two peers send offer simultaneously (mock signalingState='have-local-offer' collision); assert exactly one negotiation wins; tracks subscribed correctly after resolution | RFC 8829 §5.3.1 glare | talk: MED |
| 11 | **Safari M-line order rejection on renegotiation** | Inject SDP offer with swapped M-line order vs initial; assert setRemoteDescription error caught, fallback renegotiation attempted, call not silently broken | Safari WebRTC quirks | talk/see: MED |
| 12 | **Volume > 1.0 stored state vs capped playback divergence (B15)** | Seed localStorage with `volume=1.3`; start service; assert startup migration clamps to 1.0 and persists; slider max shows 1.0 | B15 design requirement | talk: LOW (UX) |

---

## Harness tooling commands + blockers

### PulseAudio null-sink setup (T2, Linux)
```bash
# Verify PulseAudio running
pactl info | grep "Server Name"

# Create sinks (returns module IDs — save for cleanup)
SINK1=$(pactl load-module module-null-sink sink_name=meet_sink_1 \
  sink_properties=device.description=MeetSink1)
SINK2=$(pactl load-module module-null-sink sink_name=meet_sink_2 \
  sink_properties=device.description=MeetSink2)

# Record monitors (background; kill when done)
parecord --device=meet_sink_1.monitor --file-format=wav /tmp/meet_sink1.wav &
PARECORD1=$!
parecord --device=meet_sink_2.monitor --file-format=wav /tmp/meet_sink2.wav &
PARECORD2=$!

# Cleanup
kill $PARECORD1 $PARECORD2
pactl unload-module $SINK1
pactl unload-module $SINK2
```

### Chrome flags for T2
```bash
chromium-browser \
  --use-file-for-fake-audio-capture=e2e/fixtures/440hz-tone.wav \
  --use-fake-device-for-media-stream \
  --use-fake-ui-for-media-stream \
  --disable-features=AudioServiceOutOfProcess \
  --allow-file-access-from-files \
  --unsafely-treat-insecure-origin-as-secure=http://localhost:4200
  # For non-default sink enumeration:
  --enable-audio-service-sandbox  # or --disable-audio-service-sandbox if enumeration fails
```

### Playwright multi-context
```ts
// playwright.config.ts: use: { launchOptions: { args: [...chromeFlags] } }
const host = await browser.newContext({
  permissions: ['camera', 'microphone'],
  userAgent: undefined, // desktop
});
const guest = await browser.newContext({
  permissions: ['camera', 'microphone'],
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)...', // mobile-emulated for CP sig-2
});
const hostPage = await host.newPage();
const guestPage = await guest.newPage();
```

### Audio proof: RMS check on recorded wav
```bash
# Quick RMS check (non-silent = RMS > 0.01)
ffprobe -f lavfi -i "amovie=/tmp/meet_sink2.wav,astats=metadata=1:reset=1" \
  -show_entries frame_tags=lavfi.astats.Overall.RMS_level \
  -of csv=p=0 2>/dev/null | tail -5
# Expect values > -50dB for audible; -inf or < -80dB = silent
```

### Blockers on this Linux box
1. **PulseAudio required** — verify with `pactl info`; if PipeWire-only, use `pw-loopback` + `parec` compat layer (`pipewire-pulse` package).
2. **setSinkId + device enumeration in headless Chrome** — `enumerateDevices()` returns empty labels without a prior `getUserMedia` grant; use `--use-fake-ui-for-media-stream` to auto-grant. Null sinks must be loaded BEFORE Chromium launches so they appear in enumeration.
3. **Playwright and Chrome audio sandbox** — if `--use-file-for-fake-audio-capture` is ignored, add `--disable-audio-output-processing` and verify the flag is passed through `launchOptions.args` not `args` in the context.
4. **PipeWire coexistence** — on Ubuntu 22.04+ PipeWire replaces PulseAudio; `pactl` still works via `pipewire-pulse` compatibility; test with `pactl list sinks short` to confirm sinks visible.

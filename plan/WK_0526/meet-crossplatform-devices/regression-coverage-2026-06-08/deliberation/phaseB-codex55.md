## T1 telemetry-replay plan (per signature: inject -> assert)

Note: `archaeology/signatures.md` labels "12" but lists 13 rows. Map all rows; treat `inbound-audio-recv-audioLevel-0` as a concrete subtype of flat/missing receiver energy.

Harness target: add `frontend/src/app/services/remote-audio-telemetry-replay.spec.ts` using DB fixture loader -> normalized `RTCStatsReport` frames -> pure decision adapters for `classifyRemoteAudioHealth`, voice watchdog, subscribe watchdog, SFU publish/reconnect diagnostics, and new registry `playoutDiagnostics()`. Each test replays at least one example session ID from archaeology and asserts the app emits actionable state, not silent success.

| Historical signature | Sessions | Tier | Inject | Assert current-app handling |
|---|---:|---|---|---|
| inbound-audio-recv-no-audioLevel/energy | 30 | T1, T2 sanity | Replay inbound-audio frames where bytes/packets may advance but `audioLevel` and `totalAudioEnergy` absent/null across >=4 samples. Use examples `01ec650a`, `2579eb8f`, `2b124519`. | T1: verdict is `unknown` until counters prove voice-stall; no false "audible" claim from bytes alone. Diagnostics payload contains per-publisher row with missing energy noted. T2: real WAV capture later proves positive path has energy rising. |
| inbound-audio-high-concealment | 27 | T1 | Replay `concealedSamples/(concealedSamples+jitterBufferEmittedCount) >= 0.5` after >=48000 total samples. Examples `01ec650a`, `11ee886f`. | `classifyRemoteAudioHealth(...) === 'silent'`; remote badge/diagnostic says `SILENT REMOTE`; watchdog latches `remoteAudioBlocked` unless source-mic-silent explains it. |
| inbound-audio-packet-loss | 17 | T1 | Replay inbound RTP with `packetsLost` increasing and/or high loss ratio while audio samples continue. Examples `2579eb8f`, `2b124519`. | Weak-connection/media diagnostic records loss; app does not rebuild registry solely because loss exists if `totalAudioEnergy`/emitted advance; if paired with stall, blocked banner points to impaired receive. |
| relay-path-used | 9 | T1, T2 live optional | Replay candidate-pair selected route with `relay` local/remote candidate or TURN relay route. Examples `0794bbad`, `45197347`. | Diagnostics classify route as relay and preserve it in session report; relay is not failure by itself. If RTT/loss also high, weak-connection warning is asserted. |
| subscribe-stuck-no-firstframe | 4 | T1, T2 video critical | Replay pull/subscribe accepted but remote video `framesDecoded === 0`/`firstFrameAt` missing for timeout window. Examples `01ec650a`, `2b124519`, `dd0b5dd6`. | Subscribe watchdog marks publisher/track stuck, retries pull/renegotiate once, and logs `no-first-frame`; tile remains in loading/recovery state, not connected-good. |
| ws-reconnect | 4 | T1, T2 smoke | Replay signaling timeline with disconnect -> reconnect -> resubscribe. Examples `2579eb8f`, `35f6324a`, `b0019fb6`. | Reconnect state is visible; after replay, registry still has exactly one element per publisher, subscriptions are restored, no duplicate audio elements. |
| ws-disconnect | 3 | T1 | Replay terminal WS close without successful reconnect. Examples `35f6324a`, `ae0d1932`, `b0019fb6`. | UI/diagnostics mark signaling disconnected; playout registry is torn down only on leave/end, not by transient close; recovery attempt is scheduled/counted. |
| one-inbound-audio-at-a-time(>=2 pubs never concurrent) | 2 | T1, T2 critical | Replay two publishers whose inbound audio counters never overlap; examples `11ee886f`, `5d9ec218`. | Registry asserts two concurrent `perPublisher` rows when two live tracks exist; no `mid`/publisher collision; if replay still has one active inbound, diagnostics flag missing publisher instead of treating call as healthy. |
| high-RTT-intl(>=150ms) | 2 | T1 | Replay selected candidate pair `currentRoundTripTime >= 0.150`. Examples `5d515505`, `e727a2e7`. | Weak-connection/route diagnostic records high RTT; app does not classify as playout bug unless audio stall/concealment also present. |
| outbound-audio-0bytes | 1 | T1, T2 publish critical | Replay outbound audio sender with `bytesSent === 0` after publish established. Example `01ec650a`. | Publish health marks local mic not flowing; UI/diagnostic distinguishes local publish failure from remote playout failure; no remote-audio recovery loop is triggered. |
| pc-state-bad:failed/failed | 1 | T1, T2 reconnect smoke | Replay `iceConnectionState=failed` and `connectionState=failed`. Example `01ec650a`. | SFU client enters failed/recovery state; closes/recreates session or surfaces failure according to current policy; diagnostics include failed state and last candidate pair. |
| publish-error | 1 | T1, T2 publish critical | Replay Cloudflare Realtime `/tracks/new` or local publish error. Example `0467a8c7`. | Publish state is `error`; user-visible failure/log exists; no subscriber tile is advertised for the failed local track. |
| inbound-audio-recv-audioLevel-0 | 1 | T1 | Replay inbound audio with `audioLevel: 0` while bytes/packets move. Example `11ee886f`. | Same as flat energy: voice-stall only if `totalAudioEnergy`/emitted fail to advance; if source mic silent, label as source silence; otherwise latch blocked after recovery budget. |

T1 fixture assertions to include for every replay: final `RemoteAudioPlayoutDiagnostics`, per-publisher track id, blocked reason/null, selected/effective sink, `remoteAudioBlocked`, route type, WS/SFU state, and exactly-one-registry-element-per-publisher invariant.

## T2 real-browser plan (per critical path: setup -> assert, incl parecord proof)

1. Selected-output playout proof (highest priority): host Chromium launched with real fake audio WAV plus two PulseAudio sinks; host chooses non-default `meet_selected`; guest publishes `voice.wav`; record `meet_selected.monitor` with `parecord`; assert RMS/peak > threshold and default sink monitor remains near-silent. Also assert DOM `audio[data-remote-audio]` has no `autoplay`, `sinkId === selected`, `paused === false`, diagnostics `effectiveSinkId === selected`.
2. Two concurrent remote publishers: two guests publish different WAV tones/frequencies; host selected sink recording contains both expected frequency bands; diagnostics has two publishers concurrently, no duplicate publisher ids, no one-at-a-time collapse.
3. Late join after sticky unlock: host clicks Join/Enable audio first, then guest joins; assert late publisher plays without second prompt and selected sink monitor gets audio within timeout.
4. Autoplay-block recovery: start with no gesture or force `play()` rejection via injected page hook; assert unblock banner appears, click recovery, then selected sink monitor records audio and blocked list clears.
5. Device switch during playout: while guest audio is flowing, host switches from default to `meet_selected`; assert old monitor drops and new monitor gains signal; no audio element duplication.
6. Subscribe first-frame video: guest camera fake video publishes; host desktop and mobile-emulated contexts assert `framesDecoded > 0`, visible tile first frame, and no `subscribe-stuck-no-firstframe`.
7. Recording path: host records 5-10s with guest WAV plus optional video; uploaded WebM has nonzero duration, audio track present, and `ffprobe` or browser decode shows audio energy, protecting MediaRecorder gaps.
8. Reconnect/background: run desktop + mobile-emulated contexts; briefly close WS or reload backend in controlled env; assert reconnect restores subscriptions and selected-sink playout proof resumes.

## Researched known-issues (top ~8-12: name | 1-line test | source | severity talk/record/see)

| Known issue not fully covered by 13 signatures | 1-line test idea | Source | Severity |
|---|---|---|---|
| `setSinkId`/speaker selection blocked by Permissions-Policy or unsupported browser | Serve page with restrictive `Permissions-Policy: speaker-selection=()` and assert fallback/default diagnostic, not selected-sink success. | MDN speaker-selection: https://developer.mozilla.org/docs/Web/HTTP/Headers/Permissions-Policy/speaker-selection | talk=high, record=low, see=low |
| Audible autoplay/user-gesture rejection | Launch fresh profile; attach remote audio before gesture; assert banner + gesture recovery; never rely on `autoplay` attr. | MDN autoplay guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay ; Chrome autoplay: https://developer.chrome.com/blog/autoplay/ | talk=critical, record=low, see=medium |
| `autoplay` attr races `setSinkId` for MediaStream activation | Regression: registry-created audio has no `autoplay`; `setSinkId` call precedes `play()` in call log and real sink proof. | MDN autoplay property notes MediaStream autoplay on active: https://developer.mozilla.org/docs/Web/API/HTMLMediaElement/autoplay | talk=critical, record=low, see=low |
| Device hotplug / `devicechange` not baseline across browsers | Simulate output removal + `devicechange`; assert selected sink fallback clears stale id and updates diagnostics. | MDN devicechange limited availability: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/devicechange_event | talk=high, record=medium, see=medium |
| iOS Safari WebRTC inline/autoplay quirks | Mobile Safari/manual or WebKit run: remote video uses `playsinline`; audio unlock requires explicit gesture; no hidden mixer dependency. | webrtcHacks Safari guide: https://webrtchacks.com/guide-to-safari-webrtc/ ; WebRTC samples iOS issue: https://github.com/webrtc/samples/issues/929 | talk=high, record=medium, see=high |
| Android Chrome lock/background delays MediaRecorder blobs | Start recording with timeslice, emulate background/screen-lock where possible; assert final stop/upload includes delayed data and duration is not computed from chunk count. | MDN MediaRecorder `dataavailable`: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event | talk=low, record=high, see=medium |
| Cloudflare Realtime session/track renegotiation drift | Add/close/pull tracks rapidly; assert app calls Realtime `renegotiate`, closes stale tracks, and maps track ids to publishers. | Cloudflare Connection API: https://developers.cloudflare.com/realtime/sfu/https-api/ | talk=high, record=medium, see=high |
| TURN/relay restrictive networks and alternate-port traps | Force relay ICE config; assert relay path works and diagnostics route is relay; do not depend on port 53-only fallback. | Cloudflare TURN docs: https://developers.cloudflare.com/calls/turn/ | talk=high, record=medium, see=high |
| Simulcast/RID layer mismatch or stalled low/high layer | Publish simulcast video; subscribe preferred layer; assert first frame and layer switch diagnostics. | Cloudflare simulcast docs: https://developers.cloudflare.com/realtime/simulcast/ | talk=low, record=medium, see=high |
| Renegotiation glare / offer collision during track changes | Simultaneously camera-switch/share-toggle two peers; assert polite rollback/retry or serialized SFU renegotiate prevents permanent failed state. | MDN perfect negotiation: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation | talk=medium, record=medium, see=high |
| getStats timing gaps/remote stats absent early | T1 replay missing early stat objects; assert diagnostics say `unknown` until floor/window met, no false OK or false silent. | WebRTC getStats timing discussion: https://www.webrtc-developers.com/webrtc-statistics-using-getstats/ | talk=medium, record=low, see=medium |
| Cloudflare track model is per-track, not room abstraction | Regression around publisher unmute/new audio track on same session; assert registry diffs by live audio track id, not only stream/client id. | Cloudflare Sessions/Tracks: https://developers.cloudflare.com/realtime/sessions-tracks/ | talk=critical, record=medium, see=medium |

## Harness tooling commands + any blocker

Local repo commands:

```bash
# T1 service replay/unit tests
npm test -w frontend -- --watch=false --include 'src/app/services/remote-audio-telemetry-replay.spec.ts'

# Existing relevant unit tests to keep green
npm test -w frontend -- --watch=false --include 'src/app/services/remote-audio.service.spec.ts'
npm test -w frontend -- --watch=false --include 'src/app/services/remote-audio-watchdog.spec.ts'
npm test -w frontend -- --watch=false --include 'src/app/services/remote-audio-health.spec.ts'

# T2 Playwright local/live shape
E2E_BASE_URL=http://localhost:4710 npm test -w e2e -- tests/t2-real-audio-output/ --config=playwright.config.ts --workers=1
E2E_BASE_URL=https://voice.silverjrom.app npm test -w e2e -- tests/t2-real-audio-output/ --config=playwright.live.config.ts --workers=1
```

PulseAudio setup for selected-output proof:

```bash
# create two independent output sinks
pactl load-module module-null-sink sink_name=meet_default sink_properties=device.description=Meet_Default
pactl load-module module-null-sink sink_name=meet_selected sink_properties=device.description=Meet_Selected
pactl set-default-sink meet_default

# record selected output monitor while Playwright runs
parecord --device=meet_selected.monitor --channels=1 --rate=48000 /tmp/meet-selected.wav &
REC_PID=$!
E2E_CHROME_ARGS="--use-file-for-fake-audio-capture=$PWD/e2e/fixtures/audio/voice-48k.wav --use-fake-ui-for-media-stream" \
  npm test -w e2e -- tests/t2-real-audio-output/ --config=playwright.config.ts --workers=1
kill "$REC_PID"
ffmpeg -hide_banner -i /tmp/meet-selected.wav -af volumedetect -f null -
```

Playwright Chromium launch args for T2:

```ts
launchOptions: {
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-file-for-fake-audio-capture=/abs/path/e2e/fixtures/audio/voice-48k.wav',
    '--autoplay-policy=no-user-gesture-required', // positive path only; omit in autoplay-block negative test
  ],
}
```

Multi-context shape:

```ts
const desktop = await browser.newContext({ ...devices['Desktop Chrome'] });
const mobile = await browser.newContext({ ...devices['Pixel 7'] });
```

Current Linux-box blocker check on 2026-06-08: `pactl`, `parecord`, `pw-record`, and `chromium`/`google-chrome` are not on `PATH` here. T2 needs PulseAudio or PipeWire Pulse tools plus Playwright browser installation before it can run on this box. Design remains feasible; execution prerequisite is installing `pulseaudio-utils` or PipeWire equivalent and `npx playwright install chromium`/system Chrome.

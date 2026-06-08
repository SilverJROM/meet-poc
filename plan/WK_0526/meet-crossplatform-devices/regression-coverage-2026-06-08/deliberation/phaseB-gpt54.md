## T1 telemetry-replay plan (per signature: inject -> assert)

Note: `archaeology/signatures.md` currently lists **13** bullets, not 12. Map all 13; do not silently drop one.

| signature | tier | inject | assert |
| --- | --- | --- | --- |
| `inbound-audio-recv-no-audioLevel/energy` | T1 | Replay a real inbound-audio window where packets/bytes/concealment advance but `audioLevel` and/or `totalAudioEnergy` are null. | No false silent verdict from null metrics alone; diagnostics show `level n/a` / `energy n/a`; banner only if playout/watchdog separately says blocked. |
| `inbound-audio-high-concealment` | T1 | Replay `concealedSamples / (concealedSamples + jitterBufferEmittedCount)` at the historical high ratios from the DB session. | Diagnostics classify remote audio as degraded/silent-remote candidate; no registry corruption; recovery path can latch `voice-stalled` if emitted audio does not advance. |
| `inbound-audio-packet-loss` | T1 | Replay inbound RTP deltas with real loss spikes and weak bytes growth. | Diagnostics show poor audio health / network-path risk, but do not misclassify as autoplay/device-routing failure. |
| `relay-path-used` | both | T1: replay selected candidate pair `relay`. T2: force relay / TURN path in live browser. | T1 asserts diagnostics label relay correctly. T2 asserts call still reaches selected output and `parecord` proves audible playout on the chosen sink. |
| `subscribe-stuck-no-firstframe` | both | T1: replay the exact CF subscribe race (`tracks[].errorCode`, no first frame, retry, eventual subscribe). T2: rapid leave/rejoin / republish race. | `subscribedClientIds` is cleared, retry path re-arms, `subscribeLatencies[].firstFrameAtMs` becomes non-null, registry gets a live publisher entry, no 180s silent stall. |
| `ws-reconnect` | both | T1: replay ws health cycle with disconnect/reconnect while media stats continue. T2: kill the socket / toggle offline briefly. | UI/diagnostics show reconnect history; media recovers without needing room reload; remote audio replay hooks do not leave stale blocked state. |
| `ws-disconnect` | T1 | Replay a terminal disconnect window with no successful reconnect. | State degrades honestly to transport/network failure, not autoplay/sink failure; no ghost live-publisher playout rows remain. |
| `one-inbound-audio-at-a-time(>=2 pubs never concurrent)` | both | T1: feed two concurrent remote publishers with overlapping active audio. T2: 3-browser room with A+B talking to host. | Two registry entries exist simultaneously, both `paused=false`, both `blockedReason=null`, both on selected sink; removing A leaves B audible. |
| `high-RTT-intl(>=150ms)` | both | T1: replay RTT >=150ms with corresponding jitter/loss. T2: Linux `tc netem delay` on one client if available. | Diagnostics label long-haul / intl path; app tolerates degraded network without false autoplay/device diagnosis; media resumes after RTT normalization. |
| `outbound-audio-0bytes` | both | T1: replay mic enabled + sender present but outbound audio bytes flat at 0. T2: fake mic WAV publish. | Local-mic failure is surfaced as talk-path failure (`mic silent` / sender not advancing), not remote playout failure; in T2 bytes sent become >0 with fake WAV. |
| `pc-state-bad:failed/failed` | both | T1: replay PC `connectionState=failed`, `iceConnectionState=failed`. T2: use existing ICE-failure seam / forced failure. | ICE-restart / reconnect diagnostics fire, stale remote-audio rows clear, and recovery either reconnects or lands in an explicit failed state. |
| `publish-error` | both | T1: replay failed publish response / thrown publish path. T2: deny media or inject publish rejection seam. | Publish state exits cleanly with visible error, no stuck `publishing`, no phantom local/remote tracks, retry remains possible. |
| `inbound-audio-recv-audioLevel-0` | T1 | Replay inbound packets/energy rising with `audioLevel=0` exactly. | No false silent verdict if `totalAudioEnergy` or bytes/emitted advance; diagnostics keep `level 0` visible without suppressing real playout. |

T1 evidence anchors already in repo:
- `frontend/src/app/services/remote-audio.service.spec.ts`: RA-REG-1/2/3/4/5 + CR-FIX-1/3/4/5/6 cover sink-before-play, sticky unlock, dual publishers, blocked-state consistency, fallback semantics.
- `frontend/src/app/services/sfu-client.spec.ts`: media-playout capture + subscribe recovery path.
- `changes.md`: exact historical CF `not_found_track_error` subscribe race and playout tuple.

## T2 real-browser plan (per critical path: setup -> assert, incl parecord proof)

1. Selected-speaker non-default output proof
Setup:
`pactl load-module module-null-sink sink_name=meetA sink_properties=device.description=meetA`
`pactl load-module module-null-sink sink_name=meetB sink_properties=device.description=meetB`
`parecord --device=meetB.monitor /tmp/meetB.wav`
Launch Playwright Chromium with:
`--use-fake-ui-for-media-stream`
`--use-fake-device-for-media-stream`
`--use-file-for-fake-audio-capture=/abs/path/voice.wav`
Host selects `meetB`; guest publishes audio.
Assert:
host diagnostics show `selectedAudioOutputId=meetB`, `effectiveSinkId=meetB`, `perPublisher[].paused=false`;
Chrome `media-playout.totalAudioEnergy` rises;
`/tmp/meetB.wav` has non-zero amplitude; optional monitor on `meetA.monitor` stays near-zero.

2. Late-joiner after prior unlock
Setup:
host joins, performs one real click/tap, guest joins later with fake audio.
Assert:
new publisher plays without second host gesture; no `remoteAudioBlocked` latch; `parecord` on selected sink captures audio within a bounded window.

3. Two simultaneous remote publishers
Setup:
3 contexts: host desktop + guestA desktop + guestB mobile-emulated; guestA/B use distinct fake WAVs.
Assert:
host `remoteAudioPlayout.perPublisher.length===2`, both live on same selected sink, both inbound energies rise; `parecord` proves selected device received mixed output.

4. Subscribe race / fast reconnect
Setup:
guest leaves and rejoins quickly (new CF session / new publisher id) while host stays in call.
Assert:
`subscribeLatencies` eventually contains the new publisher with `firstFrameAtMs`; no silent 180s gap; old publisher row removed; new row audible on selected sink.

5. WS reconnect + visibility/background recovery
Setup:
desktop or mobile-emulated guest is backgrounded / hidden, then resumed; separately, force WS interruption.
Assert:
existing recovery hooks (`visibility`, `pageshow`, interaction replay) recover playout; no stale `voice-stalled` / blocked latch after emitted-count advances.

6. Record path
Setup:
record with host + at least one remote audio publisher; run once in Chromium desktop, once in mobile emulation.
Assert:
non-zero recording artifact, playable locally, expected codec selected via runtime capability branch, remote audio present in the file.

## Researched known-issues (top ~8-12: name | 1-line test | source | severity talk/record/see)

| issue | 1-line test idea | source | severity |
| --- | --- | --- | --- |
| Chrome autoplay with sound requires prior interaction / MEI | Fresh profile: join room, remote audio arrives before any gesture, assert banner + click-to-recover path. | Chrome autoplay policy: https://developer.chrome.com/blog/autoplay/ | talk |
| `setSinkId()` requires HTTPS, permission, and non-default-device authorization | Run selected-speaker flow in secure context; separately block selection permission and assert `default-fallback` / explicit failure paths. | MDN `setSinkId`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId | talk |
| `speaker-selection` Permissions Policy can block enumerate/select/setSinkId | Embed app in iframe without `speaker-selection` allowlist; assert `selectAudioOutput` / `setSinkId` fail honestly. | MDN `speaker-selection`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/speaker-selection | talk |
| `devicechange` is not baseline across major browsers | Hot-plug / virtual-device swap during call; assert manual refresh / fallback path works when `devicechange` never fires. | MDN `devicechange`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/devicechange_event | talk, see |
| iOS/Safari `MediaStream` autoplay depends on capture/playback state | Safari/iOS: remote audio before capture vs after capture; assert first path requires gesture, second path autoplays if already capturing. | WebKit WebRTC autoplay notes: https://webkit.org/blog/7763/a-closer-look-into-webrtc/ | talk |
| iOS hidden/local preview can freeze unless `playsinline` is present | Safari/iOS hidden video preview / remote video test; assert continuous frames, not first-frame freeze. | WebKit bug 260345: https://bugs.webkit.org/show_bug.cgi?id=260345 | see |
| MediaRecorder container/codec support differs across Safari generations | Capability-matrix test: branch on `MediaRecorder.isTypeSupported`; assert Safari-compatible format selection and successful playback/upload. | WebKit MediaRecorder API: https://webkit.org/blog/11353/mediarecorder-api/ and Safari 18.4 update: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ | record |
| Background/frozen pages can interrupt WebRTC/media recovery | Desktop/mobile background-resume test; assert visibility/pageshow replay restores media and stale connections are not assumed healthy. | Chrome Page Lifecycle: https://developer.chrome.com/docs/web-platform/page-lifecycle-api | talk, see |
| Cloudflare Realtime is track-centric, not room-centric | Reconnect/presence test with stale vs fresh track ids; assert app never keeps old track ids after publisher session change. | Cloudflare Realtime intro: https://developers.cloudflare.com/realtime/sfu/introduction/ | talk, see |
| Cloudflare simulcast layer selection depends on `preferredRid` / `ridNotAvailable` policy | Publish 3 RID layers; subscribe preferring a missing/high layer; assert fallback layer is chosen or failure is surfaced. | Cloudflare simulcast: https://developers.cloudflare.com/realtime/sfu/simulcast/ | see |
| Cloudflare treats multiple tracks equally under bandwidth pressure | Camera + screen-share + remote receive under constrained bandwidth; assert chosen policy does not starve critical audio/video path silently. | Cloudflare simulcast/bandwidth docs: https://developers.cloudflare.com/realtime/sfu/simulcast/ | see |
| Safari interop around VP8/simulcast/Unified Plan is version-sensitive historically | Cross-browser Safari<->Chromium video call with simulcast on/off; assert negotiated video actually flows. | WebKit Safari 12.1 WebRTC update: https://webkit.org/blog/8672/on-the-road-to-webrtc-1-0-including-vp8/ | see |

## Harness tooling commands + any blocker

Commands:
```bash
# 1) virtual output devices
pactl load-module module-null-sink sink_name=meetA sink_properties=device.description=meetA
pactl load-module module-null-sink sink_name=meetB sink_properties=device.description=meetB

# 2) capture selected sink proof
parecord --device=meetB.monitor /tmp/meetB.wav

# 3) run local app
E2E_BACKEND_PORT=4722 E2E_FRONTEND_PORT=4713 E2E_PROXY_PORT=4712 \
E2E_BASE_URL=http://localhost:4712 E2E_WS_ORIGIN=ws://localhost:4712 \
npm test -w e2e -- tests/<new-crossplatform-spec> --config=playwright.config.ts --workers=1
```

Playwright launch additions for T2:
```ts
launchOptions: {
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=/abs/path/voice.wav',
    '--autoplay-policy=no-user-gesture-required' // only for control runs, not the main autoplay-negative case
  ],
}
```

Multi-context shape:
- desktop host: existing Chromium project
- mobile guest: `...devices['Pixel 7']` or `devices['iPhone 13']` project/context
- use distinct fake WAVs per guest when validating concurrency

Box status on this Linux host:
- `pactl`: missing on `PATH`
- `parecord`: missing on `PATH`
- system `google-chrome` / `chromium`: missing on `PATH`
- Playwright CLI exists and Playwright-managed Chromium is installed under `~/.cache/ms-playwright/chromium-*`

Practical blocker:
- T2 selected-speaker proof is blocked until PulseAudio/PipeWire userland tools are installed (`pactl`, `parecord` or equivalent).
- Browser is not a blocker if Playwright Chromium is used instead of system Chrome.

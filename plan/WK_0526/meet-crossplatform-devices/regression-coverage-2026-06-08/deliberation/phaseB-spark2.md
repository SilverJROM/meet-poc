# PHASE B DELIBERATION — spark2 (video/record/Cross-platform focus, round on historical telemetry signatures)

Role: `spark2` complements `spark` (audio/network) by covering VIDEO/RECORD/screen-share behavior and mobile/iOS edges.

## T1 telemetry-replay plan (per signature: inject → assert)

| Signature | Tier | Inject into replay harness | Assert (current app behavior) |
|---|---:|---|---|
| `inbound-audio-recv-no-audioLevel/energy` | T1 | Feed snapshots where inbound track has `packetsReceived` > 0 / `bytesReceived` > 0 but `RTCInboundRtpStreamStats.audioLevel` and `totalAudioEnergy` are null/0 for >=30s. | `media-playout`/audio-level fallback path classifies as degraded but not silent-bug: no infinite “tap-to-enable” loop, banner reflects actual emission gap only, and call stays joinable with recovery attempt(s) logged in diagnostics. |
| `inbound-audio-high-concealment` | T1 | Inject high `concealmentEvents` + `concealedSamples` with rising `totalSamplesDuration`. | Quality telemetry flips to degraded path, but audio path remains connected; no teardown of call, and once concealment drops, blocked flag clears. |
| `inbound-audio-packet-loss` | T1 | Inject jitter + packet-loss burst (`packetsLost`/`packetsReceived`, remote inbound stats discontinuity) while `remoteAudio` remains present. | Reconnect/recover logic remains bounded; no dropped publisher entry; both remote audio and (if present) video stream stay subscribed. |
RE-ASSERT: this one may be handled by degraded path, not immediate failure. |
| `relay-path-used` | T1 | Inject `selectedCandidatePairId` pointing to `candidateType=relay` local/remote candidates and `relayProtocol=turn` over interval. | Regression asserts: UI can still report healthy inbound stats and record/video/audio service remains functional despite relay; no hard fail on relay-only paths. |
| `subscribe-stuck-no-firstframe` | T1 + T2 | T1: snapshots have `inbound-rtp` `framesReceived=0` / `framesDecoded` flat after publisher add and no `RTCVideoSourceStats.frames` progression. T2: same with actual room flow and screen-share/video publishers. | T1 assert: subscriber restart path should force re-subscribe/recovery and mark stuck state instead of hanging forever. T2 assert: first remote frame appears within timeout or explicit fallback UI/state indicates recover path executed. |
| `ws-reconnect` | T1 | Inject ordered `wsConnected=false -> true` plus dropped/requeued signaling messages around active publishers. | No hard audio/video silence; reconnect eventually restores subscriptions and diagnostics continuity for affected publishers is preserved. |
| `ws-disconnect` | T1 | Inject transient websocket closure before/after ICE complete with queued outbound track/SDP events. | Recovery path kicks in (and re-subscribe if needed) without permanent media block; diagnostics marks signaling flake explicitly. |
| `one-inbound-audio-at-a-time(>=2 pubs never concurrent)` | T1 + T2 | T1 inject historical 2-publisher periods where both `inbound-rtp` tracks are active. | T1 assert: both publishers must be represented in `remoteAudio` registry/per-publisher diagnostics; no replacement of prior publisher during active audio. T2 assert: both remotes remain audible during concurrent room session. |
| `high-RTT-intl(>=150ms)` | T1 + T2 | Inject `RTCIceCandidatePairStats.currentRoundTripTime` above 150ms (and growing `RTT`/jitter) while transport stays established. | App transitions to quality/monitoring mode only; no immediate failed-state teardown. If > threshold persists, test expects bounded warning + stable media, not a silent one-way audio drop. |
| `outbound-audio-0bytes` | T1 | Inject `RTCOutboundRtpStreamStats.bytesSent=0` + `packetsSent` increasing only briefly for a period. | Assert publish path is surfaced distinctly (publish-error/track stop class), recording does not start/continue from dead track, and no unrelated publisher is silenced. |
| `pc-state-bad:failed/failed` | T1 + T2 | Inject `RTCPeerConnection.connectionState` / `iceConnectionState` transitions ending at `failed` and recovery transition back to `connected`/`completed`. | Test assert: recoverable teardown/reconnect occurs; diagnostics records failed state and does not treat it as user mute/bad sink. After recovery, watch `selectedPublisher` audio and video restored. |
| `publish-error` | T1 + T2 | Inject publish errors (offer/answer/setLocalDescription failure or track creation failure) for one publisher only. | Assert only that publisher is marked failed and can be republished; other publishers keep existing video/record path intact; no app-level full-room block. |
| `inbound-audio-recv-audioLevel-0` | T1 | Inject `RTCInboundRtpStreamStats.audioLevel=0` while `bytesReceived` and `totalSamplesDuration` increase. | Should not be treated as hard-disconnect; classifies as muted/silence-at-source, not transport failure. Recovery only if emission also stops. |

Focus mapping notes:
- T2-critical for this role: `subscribe-stuck-no-firstframe`, `one-inbound-audio-at-a-time`, `high-RTT-intl`, `pc-state-bad`, and `relay-path-used` are the minimum set for video+record+screen-share confidence.
- For all T2 tests, require explicit assertion that `recording` output includes/continues to include both audio and video tracks when available, and that screen-share tile/video does not disappear.

## T2 real-browser plan (per critical path: setup → assert, incl parecord proof)

- Chrome harness baseline:
  - `node --version`
  - discover bundled Chromium from Playwright cache:
    - `CHROME_BIN=$(find ~/.cache/ms-playwright -path '*/chrome-linux/chrome' | head -n1)`
    - `"$CHROME_BIN" --version`
- Real-media launch args for all T2 runs:
  - `--use-file-for-fake-audio-capture=/tmp/regression-audio.wav`
  - `--use-fake-device-for-media-stream`
  - `--use-fake-ui-for-media-stream`
  - `--autoplay-policy=no-user-gesture-required`
  - `--unsafely-treat-insecure-origin-as-secure=http://localhost:4200`

Test path A — VIDEO first-frame + selected output routing:
1. Setup 2 null sinks:
   - `pactl load-module module-null-sink sink_name=meet_sink_default`
   - `pactl load-module module-null-sink sink_name=meet_sink_nondefault`
2. Capture audio to non-default monitor:
   - `parecord -d meet_sink_nondefault.monitor --format=s16_le --channels=2 --rate=48000 /tmp/recA.wav`
3. Launch room app with recorder and explicit sink selection on host.
4. Open desktop + mobile emulated contexts:
   - one host desktop, one guest `Pixel 6` emulation, one guest `iPhone 15` emulation (Playwright `devices`)
5. Assertions:
   - host selects non-default sink
   - at least one remote video track receives first frame within 8s
   - remote audio element shows `paused=false`, `sinkId=meet_sink_nondefault`, and audio is captured by parecord (non-empty WAV).

Test path B — screen-share + record + two concurrent remotes:
1. Host shares screen/video/audio (if available) from Chrome.
2. Two remotes join (desktop + mobile emulation), each unmuted.
3. Start app recording.
4. Assertions:
   - each remote has active `video` and `audio` track ids; no 12-second gap with no `frame` progression
   - recording file on download path exists and is > 5s, non-zero bytes
   - no hard failure from one-inbound-audio-at-a-time case in mixed audio/video.

Test path C — transport path stress:
1. Force throttled network in Playwright context (and recover) for 30–60s.
2. Assertions:
   - call remains in active/recoverable state through `relay-path-used` and `high-RTT-intl` signatures
   - no stuck banner with no recover attempt.

Test path D — signaling bounce:
1. Inject websocket drop/reconnect in proxy during active multi-peer call.
2. Assertions:
   - remotes reattach and continue recording/video without full reload
   - no silent fallback where both audio+video vanish for both peers.

- Command shape (adapt to existing Playwright config):
  - `npx playwright test e2e/regression/t2-phaseB-spark2.spec.ts --project=chromium --project=MobileChrome --project=ios`

## Researched known-issues (top 10: WebRTC / cross-platform / known gaps not in 12)

| Issue | 1-line test | Source | Severity |
|---|---|---|---|
| iOS Safari autoplay is user-interaction gated; onload play/load inactive without user action. | Run muted media with no gesture and assert `play()` rejects unless explicit interaction. | [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) + [Apple iOS audio/video considerations](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html). | Talk / See |
| `getDisplayMedia` is limited availability and notably not supported on iOS Safari; Android remains device/version constrained. | Attempt screen-share in iOS/Android emulations and assert explicit non-availability path + fallback UI. | [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [Caniuse getDisplayMedia](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia). | See |
| `setSinkId` requires secure context + permission and can fail/throw; selected sink success must be observed truthfully. | Force selected-device sink-id flow + permission deny; assert fallback and diagnostic honesty. | [MDN setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId). | Talk / Record |
| iOS Safari limits concurrent media playback (multiple simultaneous audio/video streams) and forces user-driven playback in some modes. | Verify app degrades gracefully when only single media stream is playout-capable. | [Apple iOS media constraints](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html). | Talk |
| `devicechange` has limited baseline support and may be unreliable in practice. | Re-assert output routing after repeated device add/remove and expect id-staleness recovery path. | [MDN devicechange](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/devicechange_event). | Talk |
| Missing or unsupported WebRTC stats fields may be omitted, not zero; consumers must tolerate absent fields. | Inject missing fields and verify fallback metrics still evaluate with no NaN/undefined crash. | [W3C WebRTC Stats](https://www.w3.org/TR/webrtc-stats/) (mandatory fields and omission guidance; media metrics in `RTCInboundRtpStreamStats`). | Talk |
| High RTT and packet loss must be handled as quality degradation (not hard disconnect). | Create high `currentRoundTripTime` + `packetsLost` and ensure no false failure. | [W3C WebRTC Stats candidate pair metrics](https://www.w3.org/TR/webrtc-stats/). | Talk |
| renegotiation glare must be handled by application-level offer/answer rollback policy. | Trigger simultaneous offerer behavior and ensure one side aborts/rolls back and recovers cleanly. | [JSEP (RFC 8829)](https://www.ietf.org/rfc/rfc8829). | See |
| Simulcast/rid negotiation should remain spec-compliant to avoid mid-call media mapping mismatches. | Inject malformed/alternating RID behavior; ensure no wrong-layer freeze and no sender/receiver mapping leak. | [RFC 8853](https://www.rfc-editor.org/info/rfc8853) + [RFC 8853](https://www.ietf.org/doc/html/rfc8853). | Talk |
| MediaRecorder codec/container behavior varies by browser; recorded container fallback must be compatible with playback pipeline. | Record with fallback codec options and assert playable output. | [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder). | Record |

## Harness tooling commands + blockers on this Linux box
- `pactl/pacmd/parecord/wpctl` are **not installed** here, so PulseAudio null-sink + parecord proof is currently blocked on this host.
- `npx playwright --version` is available and `~/.cache/ms-playwright` contains Chromium binaries, so a Playwright+Chromium flow is viable.
- Immediate path:
  1. install PulseAudio + tools:
     - `sudo apt-get update && sudo apt-get install -y pulseaudio pulseaudio-utils`
  2. install `ffmpeg` if needed for fake WAV:
     - `sudo apt-get install -y ffmpeg`
  3. rerun commands in Test path A/B/C/D.


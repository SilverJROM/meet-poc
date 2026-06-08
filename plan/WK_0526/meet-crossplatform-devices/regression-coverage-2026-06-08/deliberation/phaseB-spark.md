# PHASE B SPARK — regression coverage plan (spark pass)

## T1 telemetry-replay plan (per signature: inject → assert)

| Signature | Tier | T1 inject | Assert (current behavior target)
|---|---|---|---|
| inbound-audio-recv-no-audioLevel/energy | BOTH | Replay inbound RTP sample window with missing/ null `audioLevel` + `totalAudioEnergy` on non-silent `bytes/emitted` (from `SfuInboundTrackStats`); include `packetsLost` and `jitterBufferEmittedCount` variants. | No false-positive “silent” verdict (`classifyRemoteAudioHealth` stays `unknown` when metrics missing), no crash in watchdog, and playability path can still proceed if bytes/emitted indicate active playout. |
| inbound-audio-recv-no-audioLevel-0 | BOTH | Replay same publisher with `audioLevel=0`, rising `totalAudioEnergy` + emitted growth. | Voice watchdog still treats as possible-voice (energy delta path), does not suppress recovery incorrectly. |
| inbound-audio-high-concealment | BOTH | Replay `concealedSamples` and `jitterBufferEmittedCount` with ratio ≥ 0.5 and emitted total ≥ 48k. | `classifyRemoteAudioHealth` -> `silent`, banner/debug reflects one of: `voice-stalled` or blocked remediation pending, not treated as healthy. |
| inbound-audio-packet-loss | T1 | Replay rising `packetsLost`/`packetLossPct` with jitter + concealment below/at thresholds. | Health degrades proportionally (concealment-derived `silent` only when floor/ratio hit), and no silent-no-banner path: recovery logic is based on bytes/emitted growth + energy deltas. |
| relay-path-used | BOTH | Replay sessions with `relayUsed=true`, `route='relayed'`, RTT>150 in connection quality fixture. | Decision path stays on relay with warning only; playout/watchdog/subscribe still active and not silently suppressed by relay flag. |
| subscribe-stuck-no-firstframe | BOTH | Replay `remotePublishers` map where publisher advertises audio track before ontrack/audio emitted first frame; inject delayed `bytes/emitted` >0 window. | Registry entry remains and watchdog marks stalled/recovery attempts (resume/kickstart/replay/rebuild) rather than dropping peer. |
| ws-reconnect | T1 | Replay WS state: `peer-reconnecting` → `peer-reconnected` sequence for one or more publishers. | Remote peer entries remain recoverable: subscribe reconciliation replays as needed and no duplicate registry entries. |
| ws-disconnect | T1 | Replay `peer-disconnected` events; remove/re-add in same room after reconnect token reuse. | `reconnecting` flag toggles, stale in-flight adds are discarded by generation guard, then remote peers re-subscribe cleanly. |
| one-inbound-audio-at-a-time(>=2 pubs never concurrent) | BOTH | Replay two remote audio publishers arriving within same tick; include one publisher track restart (`stream` stable, `audio track` id changes). | Registry size==2, no last-write-wins overwrite, and each publisher keeps independent `perPublisher` rows with distinct `trackId/trackName`. |
| high-RTT-intl(>=150ms) | BOTH | Replay quality with RTT floor/relay bias matching intl path and sustained stall windows. | Remote watchdog shows bounded stall windows + recovery attempts; no hard fatal block unless all recovery actions exhausted. |
| outbound-audio-0bytes | T1 | Replay outbound path with `bytesSent`/`bytesReceived` flat while mic track exists/ready. | Local publish quality diagnostics indicate muted/silent local sender; republish path not masked by a remote silent path, and host UI surfaces publish failure instead of generic playout-no-banner. |
| pc-state-bad:failed/failed | T1/T2 | Replay `connectionState='failed'` and `iceConnectionState='failed'` transitions mid-session. | Recovery branch executes (`restartIce`/re-subscribe/republish) and diagnostics retain prior-session evidence that decode route didn’t falsely pass. |
| publish-error | T1 | Replay deterministic publish failure events (`permission denied/not allowed/no-track` messages). | Publish state transitions to terminal/capped/retry error state, no registry leak, and no false success in `remoteAudio.outputPlaying`. |

## T2 real-browser plan (per critical path: setup → assert, incl parecord proof)

1) Non-default sink routing proof (critical)
- Setup:
  - `python3 - <<'PY'` write deterministic WAV tone in `/tmp/pulse-tone.wav`.
  - Create null sinks: `pactl load-module module-null-sink sink_name=meet-null-A`, `pactl load-module module-null-sink sink_name=meet-null-B`.
  - Start host browser with fake audio capture + explicit sink select: `--use-file-for-fake-audio-capture=/tmp/pulse-tone.wav --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`.
  - Launch 1 host + 2 remotes in Playwright with one mobile-emulated context (touch) + one desktop context.
- Assert:
  - Host selects `meet-null-B` after join.
  - Remote publisher speaks from WAV source.
  - `parecord -d meet-null-B.monitor /tmp/r2_capture.ogg` shows increasing bytes while `meet-null-A.monitor` stays ~flat.
  - Diagnostics tuple for each remote publisher: `paused=false && sinkId==selectedAudioOutputId && mediaPlayloadAudioEnergy rising` (or fallback tuple if playout stats unavailable).

2) Multi-publisher + late-joiner + replay
- Setup: same as above + remote2 joins after host selects custom sink and after `unlock` event.
- Assert: both publishers render independently (`perPublisher.length === 2`), late joiner not muted by registry dedupe, and `unlockAll()`/interaction replay restores stuck peers.

3) Network stress + relay path
- Setup: inject tc/netem `qdisc netem delay 150ms 10ms 25%` on test host interface (or app-side force-relay), plus 2+ remotes.
- Assert: `relayUsed/quality.route=relayed` in diagnostics, remote watchdog recovers stalled voice rather than dead-air with no banner lock.

4) Record path continuity
- Setup: same session with `recording` flow enabled and remote audio path active.
- Assert: local recording still emits frames while sink-routing changes; media recorder output file exists and includes remote audio chunks.

## Researched known-issues (top ~10: name | 1-line test | source | severity)

1. `setSinkId` support and rejection taxonomy (NotAllowedError/NotFoundError) — test fallback to `''` default sink and verify `sinkId` error surfacing. [MDN setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId), [MDN setSinkId sink docs](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId) — **Audio route: HIGH**.
2. Safari/WebKit historically lacked audiooutput + setSinkId (even when `enumerateDevices` present). Regression test browser-compatibility and pref-gated behavior. [WebKit bug 179415](https://bugs.webkit.org/show_bug.cgi?format=multiple&id=179415) — **Audio route: HIGH**.
3. WebKit iOS/phone autoplay policy rejects unmuted autoplay and pauses/non-visible media. Validate gesture/unmute ordering in host flow. [WebKit iOS media policies](https://webkit.org/blog/6784/new-video-policies-for-ios/) — **Cross-platform UI/AV: HIGH**.
4. `auto-play-policy` behavior differences remain on desktop browsers. Ensure fallback banner/recovery covers NoUserGesture. [WebKit autoplay policy](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/) — **AV behavior: HIGH**.
5. iOS Safari inbound-audio-only WebRTC caveat without local `getUserMedia` path. Ensure app always acquires compatible local media mode before subscribe-sensitive sessions. [WebKit bug 236357](https://bugs.webkit.org/show_bug.cgi?id=236357) — **Platform-specific: HIGH**.
6. `MediaDevices.devicechange` is limited availability and may miss edge cases. T1 should keep recovery logic independent of perfect event parity. [MDN devicechange](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/devicechange_event) — **Cross-device handling: MED**.
7. `RTCPeerConnection.connectionState`/`iceConnectionState` transitions should drive transport recovery and UX. Verify failed states always leave deterministic telemetry. [MDN connectionState](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState), [MDN ice/candidate properties](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate/type) — **Network resilience: HIGH**.
8. Renegotiation glare/perfect negotiation still an issue on concurrent track updates; verify by explicit track replacement/reply ordering. [MDN perfect negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation), [MDN negotiationneeded](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/negotiationneeded_event) — **Interoperability: HIGH**.
9. `MediaRecorder` state/data availability differences on mobile/desktop can hide recording regressions; verify state machine on `start/stop/dataavailable`. [MDN MediaRecorder state](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/state), [MDN MediaRecorder.start](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start) — **Record path: MED**.
10. SFSafariViewController/background tab and app-switch behavior may stop playback despite connected media track. Validate `visibility/pageshow` replay hooks. [WebKit bug 226163](https://bugs.webkit.org/show_bug.cgi?id=226163) — **Lifecycle/OS: HIGH**.

## Harness tooling commands + blockers

- Required tools on this Linux box (blocking status):
  - `pactl`, `parecord`, `pactl`/`wpctl` missing.
  - `google-chrome`, `chromium`, `chromium-browser`, `playwright` CLI missing globally.
  - `node` and `npm` present.

Recommended unblock sequence:
1. Install browser + audio tooling (`google-chrome-stable` or Chromium, PulseAudio/pipewire-pulse + pactl/parecord).
2. Ensure `npm` test deps are installed and Playwright browsers available (`npm ci`, `npx playwright install`).
3. Re-run all T2 commands after verifying null-sink creation (`pactl list short sinks`) and `parecord` monitor reads.

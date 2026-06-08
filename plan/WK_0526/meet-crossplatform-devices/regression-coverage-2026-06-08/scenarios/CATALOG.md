# Regression Scenario Catalog — historical (12) + researched (~15)
Tier: T1=telemetry-replay/unit (cheap, deterministic), T2=real-browser (Playwright-Chromium + diagnostics tuple; parecord-acoustic-proof DEFERRED until pulseaudio installed).

## A. HISTORICAL (from archaeology/signatures.md) — recreate + assert app handles
| # | signature (#sess) | tier | inject | assert |
|---|---|---|---|---|
| H1 | inbound-audio-recv-no-audioLevel/energy (30) | T1 | getStats: inbound audio bytesReceived climbing, audioLevel/totalAudioEnergy=null, element paused=false | watchdog `voiceRecoveryWindowExhaustedWhileStalled`/recoverVoicePlayout path + diagnostics surfaces state (not silent) |
| H2 | inbound-audio-high-concealment (27) | T1 | concealedSamples high + bytes climbing | NOT falsely flagged broken if audio still emitting; concealment captured in diag |
| H3 | inbound-audio-packet-loss (17) | T1 | packetsLost>0 | loss captured; no false ICE-fail |
| H4 | relay-path-used (9) | T1 | local/remote candidate=relay | relayUsed=true persisted; no false failure |
| H5 | subscribe-stuck-no-firstframe (4) | T1 | subscribeLatency initiated, firstFrame=null >10s | subscribe-stuck watchdog → retry (planSubscribeRetry) |
| H6 | ws-reconnect/disconnect (4/3) | T1 | wsHealth disconnect/reconnect counts | reconnect handled; diag records; no permanent drop |
| H7 | one-inbound-audio-at-a-time (2 = JROM) | T1+T2 | 2 publishers, never concurrent inbound | registry holds BOTH; mid-guard no-evict; both audible |
| H8 | high-RTT-intl>=150ms (2 = JROM intl) | T1 | rtt>=150 | intl-hint; no false fail |
| H9 | outbound-audio-0bytes (1) | T1 | outbound audio bytesSent=0 while mic live | outboundAudioSilent flagged (LOCAL), NOT remote watchdog |
| H10 | pc-state failed/failed (1) | T1 | connState/ice=failed | FIX4 relay re-fetch + FIX2 re-subscribe path; recovery logged |
| H11 | publish-error (1) | T1 | SFU new/publish error | error surfaced; not silent |
| H12 | inbound-audio-audioLevel-0 (1 = JROM) | T1 | audioLevel=0 (present) sustained | stalled-verdict same as null; diag distinguishes 0 vs null |

## B. RESEARCHED known-issues (add as tests)
| # | issue | tier | assert | src |
|---|---|---|---|---|
| R1 | setSinkId-before-play order race | T2 | service applies sink BEFORE play (already B13/B9); never first-frames-on-default | MDN setSinkId |
| R2 | setSinkId rejection taxonomy (NotAllowed/NotFound) | T1 | applyMediaElementSinkWithDefaultFallback → 'default-fallback'/'failed'/'unsupported'; honest state | MDN |
| R3 | iOS Safari no setSinkId | T1/T2 | returns 'unsupported'; no crash; banner not falsely blocked | WebKit 179415 |
| R4 | autoplay NotAllowedError | T2 | join w/o gesture → remoteAudioBlocked=true + banner | Chrome autoplay |
| R5 | Android/page backgrounding | T2 | hidden→visible → recoverRemoteAudio('visibility') resumes | Page Lifecycle |
| R6 | MediaRecorder background frame-gap | T2 | recording resumes, no >1s silent gap, duration from data not chunk-count | MDN MediaRecorder |
| R7 | devicechange headset-unplug mid-call | T1 | B18 sink-timeout ≤2s; default fallback; audio continues | W3C MediaCapture |
| R8 | opus DTX false-stalled | T1 | DTX silence (bytes flat OR energy-0-but-emitted-climbing) → NO false recovery/banner | RFC 6716 |
| R9 | ICE restart gap | T1 | failed→checking→connected → re-subscribe; gap bounded | RFC 8445 |
| R10 | renegotiation glare | T1 | simultaneous offer → one wins, tracks subscribed after | RFC 8829 |
| R11 | volume 1.3 stored vs 1.0 cap (B15) | T1 | startup migrates stored>1 → 1.0 | B15 |
| R12 | Cloudflare renegotiation drift / stale-track | T1 | rapid add/close → app renegotiates, maps trackName→publisher, closes stale | CF Realtime API |
| R13 | simulcast/RID fallback | T2 | (video) preferred-RID missing → fallback or surfaced | CF simulcast |

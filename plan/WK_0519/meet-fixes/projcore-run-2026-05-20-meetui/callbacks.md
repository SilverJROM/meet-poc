# Codex -> Projcore Callback Channel (v2.0)

Codex appends one line per STATUS change: `[projcore callback] <batch-id> <STATE> <note>`

---
[projcore callback] mui PROPOSED Meet-like restyle plan prepared; own/standard Ionicons only; recommend dark call surface; waiting for APPROVED-PLAN before code.
[projcore callback] mui DONE DR-26 Meet-like reskin committed b972c01; backend tests PASS; npm run build PASS; Playwright/screenshots and live-deploy DEFERRED (call freeze).
[projcore callback] mui DONE iter1 test-selector fixes committed 64ec2eb; MUI 4/4 PASS; b4-call-ui 8/8 PASS; Run-1/diag gate 96/96 PASS; affected recording selectors 8/8 PASS; pm2 clean env verified.
[projcore callback] chat PROPOSED DR-27 plan ready: existing-WS chat message relayed admitted-only in memory with no persistence; room side panel + unread badge + text-only XSS-safe rendering; waiting for APPROVED-PLAN.
[projcore callback] chat DONE DR-27 ephemeral chat committed fd59ca9; backend 117/117 PASS (1 skipped); build PASS; chat e2e 1/1 PASS; MUI 4/4 PASS; b4-call-ui 8/8 PASS; Run-1/diag gate 96/96 PASS; pm2 clean env verified.
[projcore callback] diaglog PROPOSED DR-28 plan ready: persist per-session diagnostics samples including ICE/quality/reconnect/error data plus active outbound audio/video sender track deviceId+label; separate auth-gated diagnostics log page; waiting for APPROVED-PLAN.
[projcore callback] diaglog DONE DR-28 persistent diagnostics log committed 90d0125; backend 119/119 PASS (1 skipped); build PASS; diaglog e2e 1/1 PASS; screenshot captured diagnostics-log-view.png; pm2 clean minimal-env restart verified; test rooms cleaned.
[projcore callback] reconcile PROPOSED DR-31 plan ready: fix reconnect resume mechanism with stable participant identity, same-tile reconnecting state, no-readmit host+guest resume, and stale ghost dedup; waiting for APPROVED-PLAN.
[projcore callback] reconcile DONE DR-31 stable participantId reconnect reconciliation implemented; backend 121/121 PASS (1 skipped); build PASS; reconcile+DIAGF+MUI+chat+diaglog isolated e2e 10/10 PASS; no pm2 restart/deploy; pm2 env clean.
[projcore callback] tilefix PROPOSED DR-30/DR-32 plan ready: mirror camera video elements only, keep screen-share unmirrored, pin gallery/share-strip order while retaining active-speaker highlight; waiting for APPROVED-PLAN.
[projcore callback] tilefix DONE DR-30/DR-32 local-self-view-only mirror + stable tile order implemented; build PASS; tilefix e2e 2/2 PASS; targeted gate 12/12 PASS; pm2 clean env verified.
[projcore callback] extdev PROPOSED DR-29 plan ready: fix selected external mic mismatch before publish/switch/reconnect, verify RTCRtpSender outbound audio deviceId via DR-28 diagnostics; waiting for APPROVED-PLAN.
[projcore callback] extdev DONE DR-29 external mic reconciliation implemented; backend 121/121 PASS (1 skipped); build PASS; extdev e2e 1/1 PASS; DR25/DR28/DR31 targeted gate 6/6 PASS; pm2 clean env verified.
[projcore callback] diaglog-recv PROPOSED DR-33 plan ready: add receive-side inboundAudio from audio inbound-rtp plus receiver track state, keep combined quality stats unchanged, display Audio recv, no migration expected; waiting for APPROVED-PLAN.
[projcore callback] diaglog-recv APPROVED-PLAN DR-33 plan approved; implementing capture/display/test without changing media or quality behavior.
[projcore callback] diaglog-recv DONE DR-33 inboundAudio diagnostics implemented; backend diagnostics test PASS; build PASS; isolated 48xx e2e PASS; pm2 restarted clean with no env leak.
[projcore callback] audiofix PROPOSED dedicated remote audio sink in tile; room-level autoplay unblock prompt; preserve sink routing
[projcore callback] audiofix APPROVED-PLAN live peer stream binding; all video muted; implement DR-34 now
[projcore callback] audiofix DONE DR-34 remote audio decoupled from camera-gated video; live stream audio sink; autoplay prompt; setSinkId preserved; build/e2e/pm2 PASS
[projcore callback] mic-liveness PROPOSED DR-35 plan ready: read local mic liveness from getStats media-source audioLevel/totalAudioEnergy, persist top-level outboundAudioLevel/outboundAudioEnergy/micSilent, red-flag diagnostics display; waiting for APPROVED-PLAN.
[projcore callback] mic-liveness APPROVED-PLAN DR-35 approved; implementing getStats media-source capture/display/test with no auto-recover or quality changes.
[projcore callback] mic-liveness DONE DR-35 outbound mic liveness committed; build PASS; isolated 48xx e2e PASS; pm2 restarted clean with no env leak.
[projcore callback] turn-tls443 PROPOSED CF /credentials/generate returns no TLS 443, but CF docs/live generate-ice-servers confirm turns:turn.cloudflare.com:443?transport=tcp is supported; plan is guarded derived 443 from CF TLS host plus static-env preservation; waiting for APPROVED-PLAN.
[projcore callback] turn-tls443 APPROVED-PLAN DR-36 approved; implementing guarded same-entry TLS-443 derivation from existing CF turns host with dedupe and tests.
[projcore callback] turn-tls443 DONE DR-36 Cloudflare TURN TLS-443 fallback committed; targeted/full backend tests PASS; build PASS; pm2 restart clean with no env leak.
[projcore callback] identity PROPOSED DR-37 plan ready: persistent localStorage clientKey sent on WS join; server indexes active/reconnecting peers by (roomId, clientKey) and reuses DR-31 peer-resumed path; no cookie planned; waiting for APPROVED-PLAN.
[projcore callback] identity APPROVED-PLAN DR-37 approved with meeting-lifetime clientKey identity map required; implementing durable participantId reuse without DR-39 auto-admit policy.
[projcore callback] identity DONE DR-37 persistent browser clientKey identity committed 5eb3592; backend 126/126 PASS (1 skipped); build PASS; isolated 48xx identity e2e PASS; pm2 clean restart verified no env leak.
[projcore callback] admit PROPOSED DR-39/DR-38 plan ready: button-only leave message revokes membership/removes card; refresh/unload/ws close are drops with reconnecting card and known admitted clientKey auto-admit; waiting for APPROVED-PLAN.
[projcore callback] admit APPROVED-PLAN DR-39/DR-38 approved; implementing message-only leave revocation, close-as-drop, re-admit clears revoke, and targeted tests.
[projcore callback] admit DONE DR-39/DR-38 committed 22e6689; backend/build/e2e PASS; explicit leave message only revokes; bare close/reload are drops; pm2 env clean.
[projcore callback] diag-deep PROPOSED DR-41/DR-43 plan ready: split into auth/toggle/all-participant posting plus deep WebRTC/WS forensics capture/display; waiting for APPROVED-PLAN.
[projcore callback] diag-deep DONE DR-41-slice-only committed 52df694; admitted owner+guest diagnostics posting with membership auth and localStorage toggle; backend/build/e2e/deploy PASS; stopping before DR-43.
[projcore callback] diag-deep PROPOSED DR-43-only plan ready: add capture/persist/display for candidate-pair, gathering/relay, ICE restart audit fields, signaling/negotiation timeline, WS health, and disconnect cycle log; no recovery behavior change; waiting for APPROVED-PLAN.
[projcore callback] diag-deep APPROVED-PLAN DR-43 approved with bounded timelines/cycle logs and existing diagnostics cadence/state-change sampling only; implementing capture/display without behavior change.
[projcore callback] diag-deep DONE DR-43 committed 82cf7c0; candidate-pair/gathering/ICE restart/signaling timeline/WS health forensics persisted and displayed; backend/build/e2e/deploy PASS; pm2 env clean.
[projcore callback] video-weak PROPOSED DR-42 plan ready: sustained poor degrades video sender to low bitrate/scale/fps first; only critical audio-protective floor or manual audio-only fully pauses; recovery restores; waiting for APPROVED-PLAN.
[projcore callback] video-weak APPROVED-PLAN DR-42 approved: implement good -> degraded active video -> conservative audio-only floor; preserve DR-13 audio high priority and manual audio-only.
[projcore callback] video-weak DONE DR-42 committed be700a8; weak/poor now degrades active video to 120kbps scale4 8fps before conservative audio-only floor; build/e2e/deploy PASS; pm2 env clean.
[projcore callback] stability PROPOSED DR-40 plan ready: terminal failed after 3 ICE restarts triggers capped PC recreate/full renegotiate with same participantId; glare rollback/re-offer; WS reopen rejoin/resync with clientKey; relay/backoff tuning; waiting for APPROVED-PLAN.
[projcore callback] stability APPROVED-PLAN DR-40 approved with sustained-good recreate cap reset and reconnect/resume yielding guard; implementing now.
[projcore callback] stability DONE DR-40 committed 71e637e; terminal failed PC auto-recreate with same participantId, glare rollback, WS resync, relay/backoff tuning; build PASS; DR40 adjacent e2e 12/12 PASS; clean pm2 deploy verified no env leak.
[projcore callback] gap-analysis DONE independent WebRTC reliability gap analysis written; main blind spot is SFU decision for 5+ plus WS heartbeat/device hotplug/Safari hardening.
[projcore callback] ws-heartbeat PROPOSED DR-44 plan ready: ws.ping/pong server heartbeat, client app-level liveness timeout, stale termination as drop/reconnect grace, DR-43 heartbeat diagnostics fields; waiting for APPROVED-PLAN.
[projcore callback] ws-heartbeat APPROVED-PLAN DR-44 approved: implementing conservative two-cycle heartbeat, non-leave stale closes, DR-43 WS-health fields, and clean deploy.
[projcore callback] ws-heartbeat DONE DR-44 heartbeat implemented; stale server terminate routes through drop/reconnect grace; client stale close uses non-leave 4000; backend/build/deploy PASS; pm2 env clean.
[projcore callback] cap5 PROPOSED cap=5 total, mobile cap stays 4; mobile peers auto-degrade outbound video at room size >=4 while preserving manual video-on and audio priority.
[projcore callback] cap5 APPROVED-PLAN implementing cap=5/mobile-cap=4 and mobile >=4 outbound auto-degrade with restore + DR-42 layering.
[projcore callback] cap5 DONE DR-50 interim cap=5/mobile-cap=4 implemented; mobile >=4 outbound video auto-degrades with restore and DR-42/DR-13 layering; targeted tests/build/deploy PASS; commit f351405.
[projcore callback] mobile-rx-video PROPOSED DR-51/DR-52 plan ready: propagate server isMobile in presence/media state, cap sender video toward mobile remotes at degraded tier without touching audio, and progressively auto-pause non-active-speaker inbound video on strained mobile receivers; waiting for APPROVED-PLAN.
[projcore callback] mobile-rx-video APPROVED-PLAN implementing unconditional video degrade toward mobile remotes plus local-mobile non-active-speaker progressive receiver cull; audio untouched; deploy after build/tests.
[projcore callback] mobile-rx-video DONE DR-51/DR-52 committed fa84025; mobile remotes receive unconditional degraded video, strained mobile receivers cull/restore non-active-speaker video only, audio remains active; build/tests/deploy PASS; pm2 env clean.
[projcore callback] share-camera-cut PROPOSED DR-53 plan ready: detect any active screen share from local media + peer media-state, auto-pause outbound camera senders to all peers with avatar fallback, preserve screen-share stream and all audio, restore pre-share camera state on share end, and allow manual camera-on override during share.
[projcore callback] share-camera-cut APPROVED-PLAN implementing DR-53 approved plan: share-active camera suppression with presenter share-track exemption, pre-share restore, manual override, audio untouched, and DR-42/cap5/DR-51 composition.
[projcore callback] share-camera-cut DONE DR-53 implemented: active share suppresses participant camera senders with avatar fallback, presenter share stream/audio preserved, manual override and pre-share restore covered; build/e2e/deploy PASS; commit pending.
[projcore callback] device-recovery PROPOSED mic onended/onmute auto-reacquire with debounce; camera onended/onmute reacquire/fallback/off; selected-device signal updates; DR-13/29/34 preserved; waiting for APPROVED-PLAN.
[projcore callback] device-recovery APPROVED-PLAN implementing capped/backoffed DR-46 device recovery with no PC recreate, renegotiation, admit, identity, or reconnect changes.
[projcore callback] ios-audio PROPOSED DR-45 plan ready: central join/admit/unblock gesture resumes registered AudioContexts and plays remote sinks; iOS uses one shared Web Audio remote mixer/output with setSinkId preserved; waiting for APPROVED-PLAN.
[projcore callback] ios-audio APPROVED-PLAN DR-45 approved: implementing central unlock plus iOS shared remote-audio mixer with rewire on peer/stream/audio-track changes and source cleanup on peer-left.

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

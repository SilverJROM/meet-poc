# Batch F1-instrument Changes

## Scope
- branch or checkpoint: fix/meet-conn-diag

## User Report
Batch-F1: Outbound-RTP video + audio jitter-buffer instrumentation + fix screenshare-expected (DR-54). Add outbound video RTP, inbound video, inbound audio jitter-buffer, transceiver/negotiation diagnostics, and fix isInboundVideoExpected so screen sharing is expected video. Additive diagnostics only; no negotiation/media-path behavior changes.

## Root Cause
- Diagnostics sampled inbound video frames and local video track identity but did not persist outbound-rtp video counters, so a future video-dead call could not distinguish "sender never sent frames" from "receiver never received frames."
- Audio diagnostics counted packets but did not expose jitter-buffer or concealment fields needed to quantify lag.
- The negotiationneeded handler only logged the event and did not make it observable that no offer was sent by that handler.
- `isInboundVideoExpected()` returned false whenever `screenOn` was true, so screen share no-frame/freeze labels were suppressed.

## Files Changed
- frontend/src/app/services/meeting-sessions.service.ts
- frontend/src/app/services/webrtc.service.ts
- frontend/src/app/services/webrtc-diagnostics.ts
- frontend/src/app/services/webrtc-diagnostics.spec.ts
- frontend/src/app/pages/diagnostics/diagnostics.page.ts
- frontend/src/app/pages/diagnostics/diagnostics.page.html
- plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F1-instrument/scenarios.md
- plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F1-instrument/changes.md
- plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F1-instrument/review.md
- plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F1-instrument/test-report.md
- plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F1-instrument/independent-validation.md

## What Changed
- Extended diagnostics payload types for outbound video stats, sender encoding, transceiver state, inbound video RTP/jitter-buffer fields, and inbound audio jitter-buffer/concealment/remote-inbound fields.
- Populated those fields from the existing `pc.getStats()` quality polling loop and `pc.getTransceivers()` snapshots.
- Added observe-only negotiationneeded offer-sent forensics by recording `offerSent=false` on the event and `lastNegotiationNeededOfferSent=true` when an actual offer-sent event is recorded.
- Changed inbound-video expectation logic so screen sharing peers are expected video senders even when camera is off, while preserving existing manual-audio-only and receiver pause exclusions.
- Surfaced key new diagnostics page fields: outbound video sending/frames/quality reason and inbound audio jitter-buffer delay.
- Added a focused TypeScript spec harness for the screenOn=true/camEnabled=false expectation and compile-time sample coverage for outbound video plus jitter-buffer fields.

## Per-File WHY
- `meeting-sessions.service.ts`: diagnostics API shape needed to carry DR-54 fields through persisted samples and diagnostics pages.
- `webrtc.service.ts`: this is the source of per-peer RTP, transceiver, negotiation, and expectation diagnostics.
- `webrtc-diagnostics.ts`: isolates expectation logic so the screen-share regression can be tested without an Angular runtime test target.
- `webrtc-diagnostics.spec.ts`: provides focused coverage for the screen sharing expected-video case and validates new field shapes.
- `diagnostics.page.ts/html`: operators need the new fields visible in the diagnostics log page during the next real call.

## Self-Verification
- command or method: `npx tsc -p frontend/tsconfig.spec.json --outDir /tmp/meet-poc-frontend-spec`
- result: PASS
- command or method: `node /tmp/meet-poc-frontend-spec/webrtc-diagnostics.spec.js`
- result: PASS
- command or method: `npm run build -w frontend`
- result: PASS with existing Stencil empty-glob warning
- command or method: `pm2 delete meet-poc-be meet-poc-fe && pm2 start ecosystem.config.js`
- result: PASS
- command or method: `curl -fsS http://127.0.0.1:4720/health`
- result: PASS `{"ok":true}`
- command or method: `curl -fsSI http://127.0.0.1:4700/`
- result: PASS HTTP 200
- command or method: shell env plus `pm2 jlist` check for `MEET_DB_PATH` and `MEET_RECORDINGS_DIR`
- result: PASS unset for shell, meet-poc-be, and meet-poc-fe

## Reproduction Notes
- before: diagnostics could show inbound video frames and local sender track only, not outbound video RTP bytes/frames or audio jitter-buffer lag; screenOn peers were excluded from expected inbound video.
- after: diagnostics payload/page include outbound video RTP, audio jitter-buffer, transceiver, and observe-only offerSent fields; screenOn=true/camEnabled=false is expected inbound video.

## Caveats
- No negotiation behavior was changed. The offerSent additions are observe-only forensics for a later renegotiation fix batch.
- No frontend browser test target exists in `frontend/angular.json`; focused validation uses `tsconfig.spec.json` plus a Node-executed compiled spec.
- Autonomous decisions: none.

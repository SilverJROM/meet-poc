# Batch F2-renegotiate Changes

## Scope
- branch or checkpoint: `fix/meet-conn-diag`
- requirement: DR-55
- commit: `fix(meet): pre-negotiate video senders`

## User Report
Video and screenshare deliver zero frames because video added after an audio-only connect is never renegotiated.

## Root Cause Mechanism
The real failed call negotiated audio-only because the sender joined with camera off. Later camera-on and screenshare entered `replaceLocalSenderTrack('video', track)`, but no video sender existed, so the code used `pc.addTrack(track, localStream)`. That requires renegotiation. The existing `pc.onnegotiationneeded` handler only logged diagnostics and never sent an offer, so the remote never received a negotiated video m-line and decoded zero video frames.

## Files Changed
- `frontend/src/app/services/webrtc.service.ts`
- `e2e/tests/v3-renegotiate/renegotiate.spec.ts`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/scenarios.md`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/changes.md`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/review.md`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/test-report.md`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/independent-validation.md`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/screenshots/receiver-camera-after-audio-only-join.png`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/screenshots/receiver-screen-after-audio-only-join.png`

## What Changed
- Peer connection creation now always negotiates a video m-line. Existing video tracks still use `pc.addTrack`; camera-off joins create `pc.addTransceiver('video', { direction: 'sendrecv', sendEncodings: [{}] })`.
- The null-track transceiver sender is stored in `videoSenders`, so later camera/screen toggles find it and use `replaceTrack()` instead of `addTrack()`.
- Sender bandwidth preferences now treat the `videoSenders` entry as video even when `sender.track` is null, so DR-13/DR-42 preferences apply before camera-on.
- `onnegotiationneeded` now records diagnostics and, when stable and not already making an offer, uses the existing `sendOffer(clientId, pc, meta, false)` perfect-negotiation path as a backstop.

## Per-File Why
- `webrtc.service.ts`: fixes the negotiation mechanism that left camera-off joins without any negotiated video sender, and adds a guarded renegotiation backstop for any future post-connect track additions.
- `renegotiate.spec.ts`: proves the real failure path with two browsers, camera-off sender, later camera-on, later screen-share, native sender parameters, and real inbound frame decoding.

## Self-Verification
- command or method: `npm run build`
- result: PASS
- command or method: `npm run build -w frontend`
- result: PASS
- command or method: `MEET_DB_PATH=/tmp/meet-dr55-renegotiate.sqlite MEET_RECORDINGS_DIR=/tmp/meet-dr55-renegotiate-recordings E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-renegotiate/renegotiate.spec.ts --workers=1`
- result: PASS, 2/2
- command or method: `pm2 delete meet-poc-be meet-poc-fe && pm2 start ecosystem.config.js`
- result: PASS, both apps online with 0 restarts
- command or method: `curl -I -s http://localhost:4700` and `curl -I -s http://localhost:4720/api/ice-config`
- result: PASS, both returned 200
- command or method: `pm2 env 54` / `pm2 env 55` filtered for `MEET_DB_PATH|MEET_RECORDINGS_DIR|E2E_*`
- result: PASS, no leaked test environment variables

## Reproduction Notes
- before: `onnegotiationneeded` only set `lastNegotiationNeededOfferSent = false`; camera-off join had no stored video sender, so camera-on used `addTrack()` without a follow-up offer.
- after: camera-off join has a stored null-track video sender with applied video encodings; camera-on and screen-share use `replaceTrack()` and receiver `framesDecoded` advances.

## Caveats
- No autonomous decisions.
- `TEST_ROOM01` was not touched.

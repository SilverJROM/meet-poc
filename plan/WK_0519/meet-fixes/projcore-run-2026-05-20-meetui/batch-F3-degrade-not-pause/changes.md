# Batch F3 Changes

## Scope
- branch or checkpoint: fix/meet-conn-diag

## Files Changed
- frontend/src/app/services/webrtc-video-policy.ts
- frontend/src/app/services/webrtc-video-policy.spec.ts
- frontend/src/app/services/webrtc.service.ts
- frontend/src/app/services/media.service.ts
- plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/callbacks.md

## User Report
DR-56: video must degrade, not fully pause, on a marginal relay link; it must restore on sustained weak quality, not only sustained good quality.

## Root Cause
The DR-42 auto policy treated every `audioOnlyFloor` as a full receiver pause. Marginal bandwidth/loss/RTT/jitter therefore sent `videoPaused=true`, causing the remote sender to disable outbound video. Restore then required sustained `good`, so a usable but weak relay link stayed latched off.

## What Changed
- Extracted `decideAutoReceiverVideoPolicy()` as a pure helper for pause/degrade/restore decisions.
- Routed marginal but connected audio-only floors to auto-degrade, while truly dead failed/disconnected/zero-packet links still pause.
- Changed recovery counters so sustained non-poor quality (`weak` or `good`) restores degraded video after the hysteresis window.
- Added video `degradationPreference`: camera `maintain-framerate`; screen share `contentHint='detail'` and `maintain-resolution`.
- Left audio sender priority behavior unchanged at `priority='high'` and `networkPriority='high'`.

## Self-Verification
- command or method: `npx tsc -p frontend/tsconfig.spec.json --outDir /tmp/meet-f3-spec`
- result: PASS
- command or method: `node /tmp/meet-f3-spec/webrtc-video-policy.spec.js`
- result: PASS
- command or method: `npm run build -w frontend`
- result: PASS
- command or method: `pm2 delete meet-poc-be meet-poc-fe && pm2 start ecosystem.config.js`
- result: PASS, both apps online with 0 restarts
- command or method: `curl -I --max-time 10 http://127.0.0.1:4700/` and `curl -sS --max-time 10 http://127.0.0.1:4700/api/ice-config`
- result: PASS, frontend and backend served HTTP 200
- command or method: `pm2 env 56` / `pm2 env 57` filtered for `MEET_DB_PATH|MEET_RECORDINGS_DIR|E2E_*`
- result: PASS, no output

## Reproduction Notes
- before: Existing code added marginal `audioOnlyFloor` peers to `autoPausedReceivers` and restored only when `metrics.quality === 'good'`.
- after: Pure helper asserts marginal connected floor => `degrade`, true zero-packet dead link => `pause`, and sustained `weak` degraded peer => `restore`.

## Caveats
- Existing full browser weak-link coverage still uses the simulated `critical` sample as a true zero-packet floor; DR-56 marginal behavior is covered by the pure helper to avoid a component harness.
- `TEST_ROOM01` was not touched.
- Autonomous decisions: none.

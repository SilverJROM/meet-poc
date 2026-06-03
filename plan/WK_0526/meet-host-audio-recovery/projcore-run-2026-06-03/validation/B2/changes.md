# Batch 2 Changes

## Branch: `feat/host-audio-recovery-20260603`

Cut from `feat/host-audio-recovery-20260603` @ `adfebb9`.

## User Report (verbatim from brief)

"why cant there be a check if something is wrong and dynamically adjust, the primary one is the voice, all parties should have atleast a monitor if the voice is being played on each device and if its not then something is wrong and needs to restart or adjust something"

## Root Cause / Strategy

R1 fixed known Chrome playout causes, but there was no outcome-level per-party watchdog to detect future cases where inbound audio bytes are received while the browser emits no remote audio frames. B2 adds that shared runtime safety net.

## Code Changes

- `frontend/src/app/services/remote-audio.service.ts` - Added pure `decideVoiceRecovery`, watchdog thresholds, debug counters, and service-owned recovery steps that reuse B1 resume/kickstart/output/rebuild paths.
- `frontend/src/app/pages/room/room.page.ts` - Added an in-call host-and-guest watchdog timer that reuses `sfuClient.collectDiagnostics().inboundTracks`, keeps per-peer windows, resets on healthy/bytes-flat/mute-all states, and escalates one recovery step per confirmed window.
- `frontend/src/app/services/remote-audio-watchdog.spec.ts` - Added deterministic unit coverage for receiving-but-flat, real silence, mute-all, emitted-climbing, attempt-cap, and short-window guards.

## Commits

- `bf5a1c4` [batch-2] add remote voice playout watchdog | scenarios: R2

## Standing Rules

- Future remote playout recovery must key off outcome stats (`bytesReceived` plus `jitterBufferEmittedCount`) and must keep mute-all / bytes-flat silence as hard no-op guards.
- Future mixer rebuild recovery must go through `removeSource` + `addSource` so B1 kickstart elements are recreated with the same muted, playing semantics.

## Verification

- Build: PASS (`cd frontend && npx ng build`)
- Unit: PASS (`cd frontend && npx tsx src/app/services/remote-audio-watchdog.spec.ts`)
- Regression unit: PASS (`remote-audio-playability.spec.ts`, `remote-audio-health.spec.ts`, `feedback-limiter.spec.ts`)
- B1 host-audio e2e: PASS 6/6 with isolated ports and absolute DB path:
  `MEET_DB_PATH=/home/agjrom/websites/meet-poc/data/e2e-b2-voice-watchdog-abs/meet-poc.sqlite E2E_BASE_URL=http://localhost:4740 E2E_PROXY_PORT=4740 E2E_BACKEND_PORT=4741 E2E_FRONTEND_PORT=4742 npx playwright test e2e/tests/b1-host-audio/host-audio.spec.ts --config=e2e/playwright.config.ts --reporter=list`
- DEV deploy: PASS (`pm2 restart meet-poc-fe`)
- DEV smoke: PASS (`curl http://localhost:4700/login` returned 200 after startup poll)

## Bug Reproductions

- Mechanism fixture: reproduced by unit fixture where `bytesReceived` climbs from 1000 to 4000 while `jitterBufferEmittedCount` stays flat. Detector escalates instead of staying silent.
- Guard fixtures: bytes-flat and mute-all fixtures return `none`, proving legitimate silence does not trigger recovery.

## Caveats

- PRE-EXISTING: B1 e2e must use an absolute `MEET_DB_PATH`; relative paths are resolved differently by the seed workspace and server process.

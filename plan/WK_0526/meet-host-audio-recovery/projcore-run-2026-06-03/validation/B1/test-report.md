# B1 Test Report

## Required Node Specs
- PASS — `npx tsx frontend/src/app/services/remote-audio-playability.spec.ts`
- PASS — `npx tsx frontend/src/app/services/remote-audio-health.spec.ts`
- PASS — `npx tsx frontend/src/app/services/feedback-limiter.spec.ts`

## Build
- PASS — `cd frontend && npx ng build`
- Warnings only: existing unused `DatePipe`, Stencil empty glob, and CommonJS MediaPipe warning.

## Focused Browser Validation
- PASS — isolated Playwright harness:
  `MEET_DB_PATH=/tmp/b1-audio-recovery-e2e/meet.sqlite MEET_RECORDINGS_DIR=/tmp/b1-audio-recovery-e2e/recordings E2E_BACKEND_PORT=4730 E2E_FRONTEND_PORT=4731 E2E_PROXY_PORT=4740 E2E_BASE_URL=http://localhost:4740 E2E_WS_ORIGIN=ws://localhost:4740 npm test -w e2e -- tests/b1-host-audio/host-audio.spec.ts --config=playwright.config.ts --workers=1`
- Result: 6/6 passed.
- Covered: muted playing kickstart element, any-interaction recovery, late source-add recovery, volume/mute regression, and soft emitted-count fallback.

## Honest Harness Note
The E6 emitted-count check had no live inbound RTP because the harness injects a synthetic local `MediaStream` into the real mixer graph rather than establishing a peer connection. The test logged the limitation and fell back to the intended proxy assertions: `contextState === 'running'` and mixer output unpaused.

## Misconfigured Attempt
- Initial root-level `npx playwright test e2e/tests/b1-host-audio/host-audio.spec.ts` did not use the E2E workspace config and failed before browser validation because the fixture default DB directory did not exist.
- A second root-level isolated attempt also failed before browser validation because the seed/webserver hook did not run. The configured workspace run above is the valid result.

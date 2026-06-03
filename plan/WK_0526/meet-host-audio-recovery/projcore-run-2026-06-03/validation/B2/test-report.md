# B2 Test Report

## Unit

- PASS: `cd frontend && npx tsx src/app/services/remote-audio-watchdog.spec.ts`
  - receiving-but-flat -> `resume`
  - attempt 1 -> `kickstart`
  - attempt 2 -> `replay`
  - attempt 3 -> `rebuild`
  - bytes-flat -> `none`
  - mutedAll -> `none`
  - emitted climbing -> `none`
  - attempt cap 4 -> `none`
  - short window -> `none`

- PASS: `cd frontend && npx tsx src/app/services/remote-audio-playability.spec.ts`
- PASS: `cd frontend && npx tsx src/app/services/remote-audio-health.spec.ts`
- PASS: `cd frontend && npx tsx src/app/services/feedback-limiter.spec.ts`

## Build

- PASS: `cd frontend && npx ng build`
- Warnings only: existing `DatePipe` unused warning, Stencil empty glob warning, MediaPipe CommonJS warning.

## E2E

- Initial attempt BLOCKED by live-port collision because default webserver tried backend `4720`.
- Second attempt with relative `MEET_DB_PATH` started but failed before audio because seed and server resolved the relative DB path differently.
- PASS after rerun with absolute isolated DB path and isolated ports:
  - Command:
    `MEET_DB_PATH=/home/agjrom/websites/meet-poc/data/e2e-b2-voice-watchdog-abs/meet-poc.sqlite E2E_BASE_URL=http://localhost:4740 E2E_PROXY_PORT=4740 E2E_BACKEND_PORT=4741 E2E_FRONTEND_PORT=4742 npx playwright test e2e/tests/b1-host-audio/host-audio.spec.ts --config=e2e/playwright.config.ts --reporter=list`
  - Result: 6 passed.

## DEV Deploy

- PASS: `pm2 restart meet-poc-fe`
- PASS: `curl http://localhost:4700/login` returned 200 after a one-second startup poll.

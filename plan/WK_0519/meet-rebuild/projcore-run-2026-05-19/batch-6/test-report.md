# Batch 6 Test Report

## Commands

| Command | Result |
|---|---|
| `npm run build` | PASS |
| `npx playwright test tests/b6-cutover/voice-silverjrom-app.spec.ts --config=playwright.public.config.ts` | PASS — 1 test |
| `npm test -w backend` | PASS — 13 files / 23 tests |
| `npx playwright test tests/b3-shell-auth --config=playwright.live.config.ts` | PASS — 8 tests |
| `E2E_WS_ORIGIN=ws://localhost:4700 npx playwright test tests/b4-call-ui --config=playwright.live.config.ts` | PASS — 8 tests |
| `npx playwright test tests/b5-recording --config=playwright.live.config.ts` | PASS — 3 tests |

## Notes

- The first backend regression after deleting `legacy-poc/` failed because `migrate-from-json.test.ts` still read `legacy-poc/data.json`. The test now creates an explicit temporary legacy JSON fixture and passes while preserving S1.7 coverage.
- B3/B4/B5 Playwright regressions were run against the live local PM2 proxy at `http://localhost:4700` to avoid starting a second backend on port `4720`.

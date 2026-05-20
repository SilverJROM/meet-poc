# FIXC8 Test Report

| Check | Result |
| --- | --- |
| `npm test -w backend` | PASS, 93 passed / 1 skipped |
| `npm run build` | PASS, backend TypeScript + frontend Angular build |
| PM2 restart | PASS, `meet-poc-fe` and `meet-poc-be` restarted and online |
| FIXC8 e2e | PASS, 3/3 via `playwright.live.config.ts` |
| Run 1 regression + FIXC8 | PASS, 67/67 via live config with `--workers=1` |
| Screenshot | PASS, `screenshots/settings-transcriber-dropdown.png` captured |

FIXC8 command:

```sh
npm test -w e2e -- tests/v3-fixc8-transcriber-config --config=playwright.live.config.ts --workers=1
```

Run 1 command:

```sh
npm test -w e2e -- tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1
```

Notes:

- The first FIXC8 e2e pass exposed Angular `[ngValue]` serializing option values as `1: medium`; the dropdown now uses plain `[value]` so the native select value is exactly the model id.
- The e2e worker temporarily restarts PM2 backend with `MEET_TRANSCRIBE_PYTHON` and `MEET_TRANSCRIBE_SCRIPT` pointing at a fake worker, then restores the normal backend process after the test.
- Final PM2 env check showed backend port `4720` and blank `MEET_TRANSCRIBE_SCRIPT` / `MEET_TRANSCRIBE_PYTHON`, so the production default script path is active.

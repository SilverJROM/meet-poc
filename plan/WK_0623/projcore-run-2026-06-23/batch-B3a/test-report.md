# Batch B3a — Test Report

## Run summary

```
Test Files  1 passed (tg-passwordless.test.ts)
     Tests  33 passed (33)
  Duration  ~7s
```

Full suite: 218 passed, 1 skipped (llm-smoke — needs API key), 0 failed. No regressions.

## Typecheck

```
npx tsc --noEmit → (no output — clean)
```

## Test breakdown

| Suite | Tests | Status |
|---|---|---|
| eligibility — constant-time anti-enumeration | 6 | ✅ all pass |
| rate limits | 2 | ✅ all pass |
| POST /api/telegram/passwordless/start | 5 | ✅ all pass |
| sendPasswordlessChallenge — Telegram message format | 2 | ✅ all pass |
| POST /api/telegram/webhook — secret-token gate | 3 | ✅ all pass |
| handleCallbackQuery — callback outcomes | 6 | ✅ all pass |
| GET /api/telegram/passwordless/status | 4 | ✅ all pass |
| POST /api/telegram/passwordless/complete | 5 | ✅ all pass |

## Notable verifications

- **Constant-time shape**: all 4 ineligible paths return `{eligible:false}`; test asserts identical deep-equality
- **Deferred send**: test asserts fetch is called after response returns (setImmediate flush)
- **Rate-limit partial-increment prevention**: test reads bucket count directly; confirms it's 3 (not 4) after 4th blocked call
- **vlk: prefix**: keyboard callback_data verified with regex `/^vlk:...\:\d+$/`
- **Atomic reserve-before-send**: two sendPasswordlessChallenge calls → 1 fetch call total
- **Secret-token 401**: missing header and wrong header both return 401
- **One-wrong-tap-kills**: denied_at and consumed_at are both set, equal value, approved_at null
- **from.id spoof**: challenge row state unchanged after foreign from.id tap
- **Single-use complete**: second complete call returns 400 "already used"
- **No token leak in status**: JSON response does not contain the raw challengeToken string

## Known test-environment artifact

Tests that trigger the start endpoint without an explicit `setTimeout` flush see a stderr log:  
`[tg-passwordless] deferred send error: TypeError: The database connection is not open`

This is expected: the test DB is torn down before the `setImmediate` fires. In production the DB is persistent. The error is caught and logged (not an unhandled rejection) — the production code is correct.

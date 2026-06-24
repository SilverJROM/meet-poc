# Batch B3a — Self Review

## Security model — lokalcamp parity check

| Requirement | Status | Notes |
|---|---|---|
| Constant-time eligibility | ✅ | 3 DB reads + setImmediate yield always; identical shape |
| Deferred send via setImmediate | ✅ | After res.json(); .catch() prevents unhandled rejection |
| vlk: prefix (not lc9:) | ✅ | Hard-coded in sendPasswordlessChallenge and handleCallbackQuery |
| 32-byte opaque token, store only hash | ✅ | generateChallengeToken() in tg-crypto.ts |
| 2-minute challenge TTL | ✅ | CHALLENGE_TTL_MS = 2 * 60 * 1000 |
| 3-button number-match, Fisher-Yates | ✅ | buildNumberMatchSet() in tg-crypto.ts |
| Atomic single-use consume (changes===1) | ✅ | WHERE consumed_at IS NULL + changes check |
| One-wrong-tap-kills (denied+consumed together) | ✅ | UPDATE sets both in single statement |
| from.id anti-spoof → silent ack | ✅ | query.from.id !== challenge.tg_user_id → answerCallbackQuery + return |
| editMessageText removes buttons | ✅ | inline_keyboard: [] on ack |
| Webhook secret-token constant-time compare | ✅ | crypto.timingSafeEqual + length check |
| 401 on wrong/missing secret | ✅ | Checked before BOT_TOKEN |
| Rate limits: 3/10min + 10/day per-user | ✅ | checkRateLimits() |
| Rate limits: 3/10min + 10/day per-email+IP | ✅ | ipBucket = ip:{ipHash}:{emailHash} |
| Rate limit check-before-increment (no partial) | ✅ | All 4 checks first, then 4 increments |
| Per-challenge 1 send (atomic reserve) | ✅ | UPDATE WHERE send_count=0 + changes===1 |
| Never reveal account existence | ✅ | Rate-blocked path also returns {eligible:false} |
| Turnstile enforced when configured | ✅ | verifyTurnstile() reads CF_TURNSTILE_SECRET per-call |
| No token values in status response | ✅ | Only returns 'pending'|'approved'|'denied'|'expired' |

## Existing paths — verified not broken

- `POST /telegram/webhook` with message update (existing /link, /start) — still handled via `handleUpdate`; secret-token check passes if header is correct or TG_WEBHOOK_SECRET is unset (dev)
- `POST /auth/telegram` (mini-app initData) — unchanged logic; reads TG_APP_TOKEN per-call
- `POST /telegram/link` — unchanged; session-cookie-based auth not affected
- `notifyOwnerLobbyPending` — unchanged outgoing send logic

## Gaps / notes for validator

- **TG_WEBHOOK_SECRET not set in .env** — added as empty stub. Ops must generate a random secret and re-register: `npm run register-webhook`. Until then, webhook runs without secret check (dev mode — existing behavior).
- **CF_TURNSTILE_SECRET not set** — Turnstile skipped in dev. Prod MUST set this.
- **Activation endpoints (R3.6)** — schema created (user_passwordless_settings, tg_passwordless_enrollments); endpoints (enroll/verify-activate/disable) are B3b scope.
- **Webhook allowed_updates** — register-webhook.ts adds callback_query to the allowed list. Until re-registered, Telegram may not send callback_query updates (depending on prior webhook registration).
- **Test-env DB teardown artifact** — logged error (not unhandled rejection) when setImmediate fires after test DB closes. Not a production concern.

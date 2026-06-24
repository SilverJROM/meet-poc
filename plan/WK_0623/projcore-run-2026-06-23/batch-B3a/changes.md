# Batch B3a — Changes

## New files

### `backend/migrations/0016_tg_passwordless.sql`
- `user_passwordless_settings` (email PK → tg_status: off|active)
- `tg_passwordless_challenges` (id, token_hash UNIQUE, email, email_hash, tg_user_id, display_number, button_numbers_json, expires_at, approved_at, denied_at, consumed_at, send_count, is_enrollment, created_at)
- `tg_passwordless_rate` (bucket, window_key → count) for anti-abuse
- `tg_passwordless_enrollments` (schema stub for B3b activation FK)

### `backend/src/lib/tg-crypto.ts`
- `generateChallengeToken()` → `{raw, hash}` (32-byte opaque base64url + SHA-256 hex)
- `hashChallengeToken(raw)` → SHA-256 hex
- `buildNumberMatchSet()` → `{display, buttons}` (random 2-digit 10–99 + 2 decoys, Fisher-Yates shuffle)

### `backend/src/lib/turnstile.ts`
- `verifyTurnstile(token, ip?)` — Cloudflare Turnstile verify; skips when CF_TURNSTILE_SECRET unset (dev), enforces when set (prod)

### `backend/src/modules/telegram/tg-passwordless.ts`
- `resolveEligibility(email, db)` — constant-time: always 3 DB reads + setImmediate yield; identical `{eligible:false}` for all failure modes
- `checkRateLimits(emailHash, ip, now, db)` — check all 4 buckets before incrementing any; 3/10min + 10/day per-user and per-email+IP
- `insertChallenge`, `getChallengeByHash`, `getChallengeById` — DB helpers
- `sendPasswordlessChallenge` — atomic reserve-before-send (send_count guard); vlk: prefix inline keyboard; error-caught async (best-effort)
- `handleCallbackQuery(query, db)` — vlk: prefix dispatch; from.id anti-spoof (silent ack); correct→approved_at; wrong→denied_at+consumed_at together; editMessageText (remove buttons) + answerCallbackQuery best-effort
- `tgPasswordlessRouter(db)` — three endpoints: start, status, complete

### `backend/scripts/register-webhook.ts`
- One-liner ops script: `npm run register-webhook`
- Sets webhook URL + secret_token + allowed_updates: ['message', 'callback_query']

### `backend/tests/tg-passwordless.test.ts`
- 33 tests across 7 describe blocks; mocked Telegram fetch; all security outcomes asserted

## Modified files

### `backend/src/modules/telegram/index.ts`
- `TelegramUpdate` extended with `callback_query?: TelegramCallbackQuery`
- Webhook handler: secret-token constant-time gate (`verifyWebhookSecret`) — 401 when wrong/missing; passes through (dev mode) when TG_WEBHOOK_SECRET unset
- `handleUpdate`: dispatches `callback_query` to `handleCallbackQuery` from tg-passwordless module
- All Telegram API calls read `TG_APP_TOKEN` per-call (was module-level constant — needed for test isolation)

### `backend/src/modules/auth/sessions.ts`
- Added `destroyAllUserSessions(email, db)` — needed by B3b activation disable flow

### `backend/src/server.ts`
- Import and mount `tgPasswordlessRouter(database)` on `/api`

### `backend/package.json`
- Added `"register-webhook": "tsx scripts/register-webhook.ts"` script

### `.env`
- Added stub entries: `TG_WEBHOOK_SECRET=` and `CF_TURNSTILE_SECRET=` with comment pointing to register-webhook

## Security properties implemented

| Property | Mechanism |
|---|---|
| Constant-time eligibility | Always 3 DB reads + setImmediate yield; identical response shape |
| Deferred send (anti-timing) | setImmediate after res.json(); best-effort .catch() |
| Atomic single-use consume | UPDATE WHERE consumed_at IS NULL + changes===1 check |
| One-wrong-tap-kills | denied_at + consumed_at set simultaneously on wrong tap |
| from.id anti-spoof | query.from.id !== challenge.tg_user_id → silent ack, state untouched |
| Webhook secret-token | crypto.timingSafeEqual with length check; 401 on mismatch |
| Rate limits | Per-user + per-email+IP, 3/10min + 10/day; check-all-before-increment |
| Token storage | 32-byte opaque raw; ONLY hash stored in DB |
| vlk: prefix isolation | Not lc9: or any other; prevents cross-handling if bot is shared |
| Never reveal account existence | All ineligible paths return identical {eligible:false} shape |

---
date: 2026-06-23
slug: passwordless-telegram-login
source: projcore
issue: "#3 — passwordless Telegram login (number-matching)"
status: design-locked (lokalcamp proven pattern, code-verified); meet-poc adaptation
---

# Decision — Passwordless Telegram login (number-matching)

## JROM's verbatim ask
> "fix on the login screen to be able to login via telegram ... a telegram icon on the login, and clicking
> shows a number on screen and pushes that number on screen with 2 other numbers on the telegram of the
> user and clicking that with acknowledgement and delete previous message logs in the user without a
> password. ofcourse this only happens when the telegram is already linked and activated on the user
> settings, otherwise clicking it says must activate passwordless login on app. this has already been done
> by lokalcamp, you can just ask for more details ... on the agent inside 'lokal' session"

## Source of truth — lokalcamp R9 (code-verified by the lokal agent, 2026-06-23)
lokalcamp's implementation was read from source. **We mirror its security model exactly**, translating the
stack: lokalcamp is CF Workers + D1 + GraphQL; meet-poc is Express + better-sqlite3 + REST. The Telegram
API mechanics (inline keyboard, callback_query, editMessageText, deleteMessage) transfer 1:1.

### The proven flow (to replicate)
1. **Start** `POST /api/telegram/passwordless/start { email, turnstileToken }`:
   - Validate email syntax; **require Turnstile** (password is NOT read). meet-poc already shows a
     Cloudflare Turnstile widget on login — reuse it.
   - **Eligibility** (constant-time, anti-enumeration): requires (a) active user, (b) passwordless status
     ACTIVE, (c) a `telegram_links` row. Any fail → `{ eligible:false }` with identical timing/shape (do
     constant awaited DB work even for non-existent emails). Never reveal account existence.
   - If eligible: **build number set** — display = random 2-digit (10–99) + 2 unique decoys, Fisher-Yates
     shuffle into 3 buttons.
   - **Challenge token**: 32-byte opaque; store only its hash. Row: display_number, button_numbers_json,
     expires_at = now+2min, user_id, email_hash.
   - Response: `{ eligible:true, challengeToken, displayNumber, expiresAt, pollAfterMs:2000 }`. Login screen
     shows `displayNumber`.
2. **Push (deferred)** — send AFTER responding (anti-timing-enumeration; in Express use
   `setImmediate`/async, not awaited in the response path). Cap-check → atomic reserve-before-send →
   Telegram `sendMessage` with `reply_markup.inline_keyboard` of 3 buttons, each
   `callback_data = "<PREFIX>:{challengeId}:{n}"`. **Use a meet-poc-specific prefix** (e.g. `vlk:`), NOT
   lokalcamp's `lc9:` — the bot may be shared; distinct prefixes prevent cross-handling.
3. **Tap capture** — Telegram webhook (meet-poc must register a bot webhook; today it uses a different
   update path — see risks). On `callback_query`:
   - **Secret-token gate**: constant-time compare `X-Telegram-Bot-Api-Secret-Token` vs `TG_WEBHOOK_SECRET`.
   - Recognize by prefix; parse `{challengeId, selectedNumber}`; load challenge; reject if
     missing/consumed/denied/expired.
   - **Anti-spoof**: `callback_query.from.id` MUST equal the challenge user's linked telegram_user_id, else
     silently ack and stop.
   - Correct number → set `approved_at`. Wrong → set `denied_at`+`consumed_at` together (**one wrong tap
     kills the challenge**, no re-guessing).
   - **Acknowledge**: `editMessageText` → "✅ Signed in to VoiceLokal" / "❌ Sign-in denied", with
     `inline_keyboard: []` (removes buttons so the stale message can't be re-tapped) + `answerCallbackQuery`
     toast. Best-effort try/catch — a Telegram error never blocks the auth record.
4. **Complete / session issuance** `POST /api/telegram/passwordless/complete { challengeToken }`:
   - Require `approved_at` set AND not denied/consumed/expired.
   - **Atomic single-use consume**: conditional UPDATE requiring `changes === 1`.
   - Issue the SAME session as password login (`createSession(email)` + session cookie). Write audit.
5. **Status polling** `GET /api/telegram/passwordless/status?challengeToken=…` → `pending|approved|denied|
   expired` ONLY, never tokens. Frontend polls every ~2s until approved → calls complete.

### Activation (test-before-activate) — authed, in settings
- **Enroll**: requires TG linked + not already active → pending-enrollment row (TTL 10min) → sends one
  **test** number-match round.
- **Verify-activate**: requires live pending + an approved (tapped) test challenge → set status ACTIVE +
  delete all sessions (force fresh login) + delete pending. Passwordless cannot go ACTIVE until the user
  demonstrably completes one number-match.
- **Disable**: requires reauth (password) → off + session-wipe + audit.

### Anti-abuse (replicate)
- Expiry: challenge 2min, enrollment 10min.
- Single-use: UNIQUE token_hash + atomic consume; one wrong tap = denied (no retry within a challenge).
- Rate limits: per-challenge 1 send (atomic reserve); per-user 3/10min + 10/day; per-(email_hash+IP)
  3/10min + 10/day (anti-bombing).
- Webhook: constant-time secret-token + from.id check; callback_data carries only ids/number (no token).
- No blind "Approve" button — number-match is mandatory (defeats MFA-bombing).

## Locked decisions for meet-poc
**D3-1.** Replicate lokalcamp's security model verbatim (constant-time eligibility, deferred send, atomic
single-use, number-match mandatory, secret-token webhook, from.id anti-spoof). Do NOT water it down.
**D3-2.** Stack translation: REST endpoints (not GraphQL), better-sqlite3 tables + a new migration (not D1),
`setImmediate`/async deferred send (not waitUntil).
**D3-3.** Callback prefix `vlk:` (meet-poc-owned), distinct from lokalcamp's `lc9:`.
**D3-4.** Env: reuse existing bot token (`BOT_TOKEN`); add `TG_WEBHOOK_SECRET` to `.env` (never in code).
**D3-5 (CONFIRMED 2026-06-23).** Activation toggle lives in user Settings and is **always shown** (JROM:
3-B "just show it"). It **reports status** — if Telegram isn't linked / passwordless isn't enabled yet, the
panel says so (e.g. "Link Telegram first" / "Not activated"). Don't hide the toggle behind linked-state;
show it + report. Disable requires reauth.
**D3-6 (CONFIRMED 2026-06-23).** Login trigger: **email must be populated first** for the Telegram button to
work — if the email field is empty, prompt to fill it (JROM: 3-A "email must be populated first, if not plug
that in, for the tg button to work"). Then **check the account has a linked TG**; if not linked/activated,
the icon shows "you must activate/enable passwordless login in the app" (not-enabled path). Email-first also
tells us whose Telegram to ping.

## meet-poc-specific risks / open items
- **R-A. Webhook ingestion.** meet-poc's current telegram module verifies WebApp `initData` (mini-app
  auto-login) and handles `/link` — need to confirm whether it already receives Telegram **webhook updates**
  (for `callback_query`) or polls. The number-match tap REQUIRES a webhook (or long-poll) that handles
  `callback_query`. This is the biggest integration unknown — B3 task T1 investigates it.
- **R-B. Turnstile server verification** must exist server-side for the start endpoint (front-end widget is
  present; confirm backend verify).
- **O3-1 → RESOLVED:** email-first trigger confirmed (D3-6).
- **O3-2 → RESOLVED:** settings toggle always shown + reports status (D3-5).
- **O3-3 → RESOLVED:** inherit lokalcamp params verbatim (JROM: 3-C "yes").
- **R-A webhook → RESOLVED by investigation (2026-06-23):** `POST /telegram/webhook` already live (join-notice
  + `/link` use it); only two scoped gaps remain — handle `callback_query` (currently message-only) + add
  `TG_WEBHOOK_SECRET` secret-token check. See `plan/B3-passwordless-tg-login.md` B3-T0.

## Reference — lokalcamp file paths (read-only, for pattern study)
```
worker/d1/migrations/0075_tg_passwordless.sql              schema
worker/src/modules/auth/tg-passwordless-service.ts         start/status/complete, eligibility, enroll/activate, caps, deferred send
worker/src/modules/auth/tg-passwordless-webhook.ts         callback_query parse, from.id check, approve/deny, message ack
worker/src/modules/auth/tg-passwordless-{mutations,queries,types}.ts   GraphQL surface (→ our REST)
worker/src/index.ts (~:153)                                POST /api/telegram/webhook secret-token gate + dispatch
worker/src/modules/telegram-link/tg-2fa-send.ts            sendNumberMatch:70, editCallbackMessage:88, answerCallbackQuery:114
worker/src/modules/auth/mfa-send-limits.ts                 rate caps
worker/src/modules/auth/crypto2fa.ts                       generateChallengeToken / hashChallengeToken
worker/src/modules/auth/service.ts                         issueAuthForUser (session)
frontend/src/app/pages/login/login.page.{ts,html}          TG button, number display, not-enabled msg, status polling
frontend/src/app/services/telegram-passwordless.service.ts
frontend/src/app/pages/tg-passwordless-settings/tg-passwordless-settings-panel.component.{ts,html,scss}
worker/test/tg-passwordless.spec.ts ; e2e/tests/16-tg-passwordless-login.spec.ts
```

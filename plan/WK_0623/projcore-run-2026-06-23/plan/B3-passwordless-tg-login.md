# Batch plan — B3: Passwordless Telegram login (number-matching)

> Gated: no implementation until JROM's post-call "go". Atomic tasks (<30min). Verifier ≠ fixer.
> Covers req-matrix R3.1–R3.10. Decision: `decisions/2026-06-23-passwordless-telegram-login.md`.
> Source pattern: lokalcamp R9 (code-verified). Replicate the security model verbatim; translate the stack.

## Affected surfaces
- `backend/migrations/0016_tg_passwordless.sql` (new) — challenges + pending-enrollment + status tables.
- `backend/src/modules/telegram/index.ts` (or a new `tg-passwordless/`) — start/status/complete endpoints,
  eligibility, enroll/activate/disable, deferred send, webhook callback_query handler, rate caps.
- `backend/src/lib/` — challenge token crypto (32-byte opaque + hash), number-match builder.
- `backend/src/modules/questions|account` settings store — `tg_passwordless` status per user.
- `frontend/src/app/pages/login/login.page.{ts,html}` — TG icon, number display, not-enabled msg, status poll.
- `frontend/src/app/pages/settings/*` — activation panel (enroll/test/activate/disable).
- `frontend/src/app/services/*` — passwordless client service.
- `.env` — `TG_WEBHOOK_SECRET` (bot token already present).

## Tasks (atomic)

**B3-T0 — Webhook gaps (RESOLVED BY INVESTIGATION 2026-06-23).** Confirmed: `POST /telegram/webhook` EXISTS
and is live (lobby join-notice + `/link` flow through it; bot token = `TG_APP_TOKEN`, same as lokalcamp).
NOT a from-scratch build. Only TWO gaps to close:
  (a) `handleUpdate` only handles `message` today (`TelegramUpdate = { update_id, message? }`) — **does not
      handle `callback_query`**. Extend the type + handler to recognize inline-button taps (the `vlk:` prefix).
  (b) **No secret-token check** on the webhook. Add `X-Telegram-Bot-Api-Secret-Token` constant-time validation
      (`TG_WEBHOOK_SECRET`) + re-register via `setWebhook` with that secret. Note: secret-token affects ALL
      updates — verify the existing `/link` + join-notice paths still work after adding it.
Both are small. Risk R-A downgraded from "biggest unknown" to "two scoped edits."

**B3-T1 — Schema.** Migration for challenges (id, token_hash UNIQUE, user_id/email_hash, display_number,
button_numbers_json, expires_at, approved_at, denied_at, consumed_at, send_count) + pending_enrollments +
per-user passwordless status. (R3.7 infra)

**B3-T2 — Token crypto + number-match builder.** 32-byte opaque token + hash; display + 2 unique decoys,
Fisher-Yates shuffle. (R3.1, R3.2) Unit test: 3 distinct numbers, display ∈ buttons.

**B3-T3 — Eligibility (constant-time).** `resolvePasswordlessEligibility(email)` — active user + status
ACTIVE + telegram_links row; constant awaited work + identical shape for ineligible (anti-enum). (R3.5, R3.7)
Test: ineligible variants all return identical `{eligible:false}` shape.

**B3-T4 — Start endpoint.** `POST /telegram/passwordless/start { email, turnstileToken }` — Turnstile verify,
eligibility, build set, insert challenge, respond `{eligible, challengeToken, displayNumber, expiresAt}`;
**deferred** send via setImmediate. (R3.1, R3.7) Test: eligible → challenge row + displayNumber; send deferred.

**B3-T5 — Telegram send.** `sendMessage` with 3-button inline keyboard, `callback_data="vlk:{challengeId}:{n}"`;
reserve-before-send cap (per-challenge 1). (R3.2, R3.8) Test (mocked TG): correct payload + prefix.

**B3-T6 — Webhook callback handler.** Secret-token constant-time gate; parse `vlk:` callbacks; from.id ==
linked telegram_user_id; correct→approved_at, wrong→denied+consumed; editMessageText ack (remove buttons) +
answerCallbackQuery. (R3.3, R3.4, R3.8) Test: correct/wrong/foreign-from.id/expired paths.

**B3-T7 — Status + complete.** `GET …/status` → pending|approved|denied|expired only; `POST …/complete
{challengeToken}` → atomic single-use consume (changes===1) → `createSession` + cookie + audit. (R3.3, R3.7)
Test: complete only after approved; double-complete fails.

**B3-T8 — Rate caps.** per-user 3/10min + 10/day; per-(email_hash+IP) 3/10min + 10/day. (R3.7)
Test: 4th send in window blocked.

**B3-T9 — Activation flow (settings).** enroll (TG linked + not active → pending + test round); verify-activate
(approved test → status ACTIVE + wipe sessions + delete pending); disable (reauth → off + wipe). (R3.6)
Test: cannot activate without a successful test tap; disable requires password.

**B3-T10 — Login UI.** TG icon next to Log in; email-first trigger (O3-1); show displayNumber + poll status →
complete; not-enabled message when ineligible. (R3.1, R3.5) Rendered UI-PROOF.

**B3-T11 — Settings UI.** Activation panel (enroll/test/activate/disable), visible only when TG linked. (R3.6)

**B3-T12 — Capstone (real-shape).** End-to-end on a real linked Telegram account: icon→number→3 buttons→tap→
logged in; wrong-tap denied; not-enabled path; no regression to /link, mini-app login, password login (R3.9);
login works from non-local network (R3.10).

## Sequencing
T0 spike gates everything. T1→T2→T3→T4→T5→T6→T7 is the core auth chain. T8 caps, T9 activation, T10–T11 UI,
T12 capstone. Likely the largest of the three batches — candidate for its own projcore sub-run.

## Open items needing JROM (non-blocking for planning)
- O3-1 email-first trigger; O3-2 settings copy/placement; O3-3 inherit lokalcamp params (2min TTL / 3 buttons /
  rate caps) or override. R-A webhook approach resolved by T0 spike.

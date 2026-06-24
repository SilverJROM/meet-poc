<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B3a: Passwordless Telegram login — BACKEND auth core (number-match: challenge → push → tap → session)

Batch ID: batch-B3a
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B3-passwordless-tg-login.md
Decision (READ IN FULL — the code-verified security model): /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/decisions/2026-06-23-passwordless-telegram-login.md
Branch: feat/recording-reliability-b5 (run branch — accumulate; no commit)
Requirements assigned: R3.1 R3.2 R3.3 R3.4 R3.7 R3.8 (backend auth; activation R3.6 + UI R3.5/R3.9/R3.10 = B3b)
North-star anchors: Issue #3.
Lifecycle: pre-live — Deferral OFF.

Estimated duration: NON-ATOMIC exception (cohesive auth mechanism) — 45min. Effort tier (PROJCORE-PROPOSED): high · validator=codex55 · RED-TEAM flagged (auth/security). Why: passwordless auth — correctness + anti-abuse critical.

Context (webhook spike ALREADY resolved by projcore): `backend/src/modules/telegram/index.ts` has `POST /telegram/webhook` (live; lobby-notice + /link use it) but `handleUpdate` today only processes `message` (TelegramUpdate = {update_id, message?}). It does NOT handle `callback_query`, and there is NO secret-token check. Bot token env = `TG_APP_TOKEN`. `telegram_links` maps tg_user_id↔email; `createSession(email)` + session cookie already exist.

Replicate lokalcamp's PROVEN number-match security model VERBATIM (full detail in the decision doc). Implement ALL:
1. R3.7 schema (new migration 0016): challenges (id, token_hash UNIQUE, user_id/email_hash, display_number, button_numbers_json, expires_at, approved_at, denied_at, consumed_at, send_count) + pending_enrollments + per-user passwordless status (active/off).
2. Token crypto: 32-byte opaque challenge token; store ONLY its hash. Number-match builder: display = random 2-digit (10-99) + 2 unique decoys, Fisher-Yates shuffle into 3 buttons.
3. Eligibility (constant-time, anti-enumeration): requires (a) active user, (b) passwordless status active, (c) telegram_links row. Any fail → {eligible:false} with IDENTICAL timing/shape (do constant awaited DB work even for non-existent emails). Never reveal account existence.
4. R3.1 Start `POST /telegram/passwordless/start {email, turnstileToken}`: verify Turnstile server-side (confirm meet-poc has a Turnstile verify; if not, add a minimal one), eligibility, build set, insert challenge, respond {eligible, challengeToken, displayNumber, expiresAt, pollAfterMs:2000}. password is NOT read.
5. R3.2 Deferred send (AFTER responding, via setImmediate — anti-timing-enum): cap-check → atomic reserve-before-send → Telegram sendMessage with 3-button inline_keyboard, callback_data="vlk:{challengeId}:{n}" (meet-poc prefix vlk:, NOT lokalcamp lc9:).
6. R3.8 Webhook tap: extend handleUpdate to handle `callback_query`. Add `X-Telegram-Bot-Api-Secret-Token` CONSTANT-TIME compare vs `TG_WEBHOOK_SECRET` (add to .env; never echo). Recognize vlk: prefix; from.id MUST equal the challenge user's linked telegram_user_id (else silently ack+stop); correct number → approved_at; wrong → denied_at+consumed_at (one-wrong-tap-kills); editMessageText ack ("✅ Signed in"/"❌ denied", remove buttons) + answerCallbackQuery; all best-effort try/catch.
7. R3.3/R3.4 Status `GET /telegram/passwordless/status?challengeToken=` → pending|approved|denied|expired ONLY (never tokens). Complete `POST /telegram/passwordless/complete {challengeToken}` → require approved & not denied/consumed/expired → ATOMIC single-use consume (require changes===1) → createSession + cookie + audit.
8. R3.7 anti-abuse: challenge TTL 2min; single-use (UNIQUE token_hash + atomic consume); per-challenge 1 send (atomic reserve); per-user 3/10min + 10/day; per-(email_hash+IP) 3/10min + 10/day.

Likely files: backend/migrations/0016_tg_passwordless.sql; backend/src/modules/telegram/index.ts (webhook callback_query, secret-token, start/status/complete, send); a new tg-passwordless service/store module; backend/src/lib/ (token crypto); backend tests (MOCK Telegram HTTP).

Scope:
- BACKEND auth core ONLY (B3b = activation enroll/verify/disable + login UI + settings toggle).
- Do NOT break the existing /link, mini-app initData login, lobby-notice (the secret-token check must not block those — apply it to the webhook + verify /link still flows).
- No git commit. Never echo TG_WEBHOOK_SECRET/TG_APP_TOKEN values. Typecheck.
- SECURITY-CRITICAL: tests assert the OUTCOMES — constant-time eligibility shape, wrong-tap kill, single-use, from.id spoof rejected, missing-secret 401.

Plan handshake (MANDATORY): 1. Read brief + the DECISION DOC + telegram module. 2. PROPOSED: mechanism + files + risks + estimate. 3. tier. 4. STATUS: PROPOSED — <approach> · complexity · why. 5. WAIT for APPROVED-PLAN. 6. REVISE→re-emit.
After APPROVED-PLAN: 7. Implement; run migration; typecheck; run the mocked auth tests. 8. STATUS: DONE when green.

Required artifacts: batch-B3a/{scenarios,changes,review,test-report,independent-validation}.md + decisions/<date>-<slug>.md (or "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B3a <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B3a[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <same short note>`. Callback file wins on mismatch.

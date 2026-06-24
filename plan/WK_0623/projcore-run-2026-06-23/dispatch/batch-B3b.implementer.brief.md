<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B3b: Passwordless Telegram login — UI (login number-match flow) + activation (settings)

Batch ID: batch-B3b
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B3-passwordless-tg-login.md
Decision: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/decisions/2026-06-23-passwordless-telegram-login.md
Branch: feat/recording-reliability-b5 (run branch — accumulate; no commit)
Requirements assigned: R3.5 R3.6 R3.9
North-star anchors: Issue #3 (D3-5 settings always-shown, D3-6 email-first).
Lifecycle: pre-live — Deferral OFF.

Estimated duration: SHORT — 30min. Effort: medium · validator=codex55 (UI-PROOF).

Context:
B3a shipped the BACKEND (security-cleared): POST /api/telegram/passwordless/start {email, turnstileToken} → {eligible, challengeToken, displayNumber, expiresAt, pollAfterMs}; GET /api/telegram/passwordless/status?challengeToken= → pending|approved|denied|expired; POST /api/telegram/passwordless/complete {challengeToken} → session cookie. Activation endpoints (B3a): enroll/verify-activate/disable for passwordless status (check tg-passwordless.ts for exact paths). Now build the UI. JROM: "a telegram icon on the login, clicking shows a number on screen and pushes that number with 2 others to telegram; clicking that logs in without a password. only when telegram is linked AND activated, else says must activate passwordless login."

Expected (acceptance — implement ALL):
1. R3.5 login UI (frontend/src/app/pages/login/login.page.*): add a Telegram ICON button next to "Log in". EMAIL-FIRST: if the email field is EMPTY when the icon is clicked, prompt the user to fill it (don't call the API). With an email, call /start; if {eligible:false} → show "You must activate passwordless login in the app." (no number). If eligible → display the displayNumber on screen, then POLL /status every ~2s (pollAfterMs) until approved → call /complete → redirect into the app (same as password login). On denied/expired → clear, allow retry.
2. R3.6 activation (settings page): an ALWAYS-SHOWN "Passwordless Telegram login" toggle that reports status — if Telegram not linked, say "Link Telegram first"; if not activated, allow Enroll → which triggers a TEST number-match round (the user taps the number in Telegram) → verify-activate sets it ACTIVE (only after a successful test tap). Disable requires reauth (password). Reflect current status.
3. R3.9: NO regression to existing password login — the password form still works exactly as before; the TG icon is additive.
4. Wire a passwordless client service (frontend/src/app/services/) to the B3a endpoints.

Likely files:
- frontend/src/app/pages/login/login.page.{ts,html,scss}
- frontend/src/app/pages/settings/* (activation panel)
- frontend/src/app/services/* (passwordless service)

Scope:
- Frontend only (B3a backend is done + verified). No git commit. Build frontend green.
- UI-PROOF: rendered-DOM/screenshot of (a) the login TG icon + displayNumber screen, (b) the not-enabled message for an ineligible email, (c) the settings activation toggle.

Plan handshake (MANDATORY): 1. Read brief + B3a endpoints + login/settings pages. 2. PROPOSED: mechanism + files + risks + estimate. 3. tier. 4. STATUS: PROPOSED — <approach> · complexity · why. 5. WAIT for APPROVED-PLAN before coding. 6. REVISE→re-emit.
After APPROVED-PLAN: 7. Implement; build green; capture UI proof. 8. STATUS: DONE.

Required artifacts: batch-B3b/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ + decisions/<date>-<slug>.md (or "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B3b <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

## ACK stop-rule (terminal only)
Before emitting a TERMINAL callback (DONE/BLOCKED), run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B3b[[:space:]]+RECEIVED[[:space:]]+(DONE|BLOCKED)' "$PROJCORE_CALLBACKS_FILE"
```
If a matching TERMINAL ack exists — STOP. (A PROPOSED-ack does NOT stop you — still emit your DONE.)

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <same short note>`. Callback file wins on mismatch.

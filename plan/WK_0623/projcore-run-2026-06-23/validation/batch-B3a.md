# Validation — batch-B3a (passwordless TG auth BACKEND) — VERDICT: PASS (security-gated)
Date 2026-06-23. Independent gate + codex55 AUTH RED-TEAM (B3 flagged §1.4g). Impl: Sonnet.
- migration 0016: challenges + rate + user_passwordless_settings; Fisher-Yates number-match builder; tg-crypto.
- lokalcamp model: constant-time eligibility (4 ineligible paths identical {eligible:false}), deferred send (setImmediate),
  vlk: callback prefix, callback_query webhook + TG_WEBHOOK_SECRET constant-time, from.id anti-spoof, atomic single-use
  consume (changes===1), one-wrong-tap-kills (denied+consumed), 2min TTL, rate caps (per-challenge 1, per-user 3/10min+10/day, per-email+IP).
- INDEPENDENT: ran tests/tg-passwordless.test.ts → 33→44 pass (codex55 added 11 red-team probes); full suite 229 passed/1 skipped; tsc clean.
- RED-TEAM (codex55) cleared ALL 7 lenses: replay (consumed/denied/expired reject no session), enumeration (identical shape),
  MFA-bomb (caps + per-challenge reservation hold), secret-token (rejects missing/wrong/length-mismatch), from.id spoof,
  wrong-tap (no revive), session-issuance (only approved/unconsumed/unexpired/non-denied). REPRO-CLEARED-ON-LOCAL.
R3.1-R3.4, R3.7, R3.8 VERIFIED (backend). R3.5(login UI)/R3.6(activation)/R3.9 = B3b. R3.10 intl = Peer2 capstone.
OPS (post-deploy, for JROM): set TG_WEBHOOK_SECRET in .env + `npm run register-webhook` (setWebhook w/ secret + callback_query allowed_updates).

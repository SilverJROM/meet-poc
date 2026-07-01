# B2a Correction — iter 1 (send-back)

Validator codex55 verdict: **REPRO-STILL-PRESENT**. The coordinator + epoch guard + rungs 1-2 are all
CORRECT and PASS (epoch guard all 4 resetOpQueue sites confirmed, bounds match consensus, no ghost streams,
tests honest). ONE gap blocks acceptance — a surviving terminal give-up path.

## The gap (gate check 5 / R2 never-give-up invariant — FAIL)
`scheduleMidCallSubscribeRetry()` still uses the LEGACY flat cap: when `planSubscribeRetry()` returns
capped it logs "mid-call subscribe permanently stopped after capped retries", deletes the timer, and does
NOT escalate into the recovery coordinator or arm the low-frequency continuation.
- Terminal path: `frontend/src/app/services/sfu-client.service.ts:1475, 1492, 1500, 1502, 1510`.
- Tests still asserting the terminal stop: `frontend/src/app/services/sfu-client.spec.ts:568, 588, 596, 597`.

This is a REAL "can't hear each other" scenario: a peer who publishes/unmutes a NEW audio track mid-call
(exactly the HRIS_TOJ pattern — people unmuting at different times) can be permanently left
advertised-not-subscribed. My earlier approval to defer the mid-call path to B2b was WRONG — the
never-give-up invariant (north-star #1) applies to ALL same-session paths in B2a.

## The ask (ONLY this — everything else is accepted, do not touch it)
1. At the mid-call cap-exhaust point (~sfu-client.service.ts:1500-1510), REPLACE the terminal
   "permanently stopped" behavior with escalation into the recovery coordinator: on cap-exhaust, route the
   publisher into `scheduleRecoveryEscalation(publisherClientId, false)` (or, if cleaner given the per-track
   keying, arm `armSubscribeRecoveryLowFrequencyRetry(publisherClientId)` after emitting `needs-rejoin`).
   Whichever you pick, the invariant is: while `canRunSubscribeRecovery(publisher)` holds, a mid-call
   newly-advertised audio track is NEVER left permanently unsubscribed — it keeps retrying at low frequency.
2. Update the tests at `sfu-client.spec.ts:568-597` that assert the terminal mid-call stop → assert the
   NEW escalation / never-give-up behavior instead (mid-call cap-exhaust escalates + continues, no permanent
   latch). Keep them honest (assert the outcome).
3. Preserve everything else — the coordinator, epoch guard, rungs 1-2, and their tests all PASSED; do not
   redo or perturb them. Do not expand scope beyond closing this one mid-call give-up.

Re-emit STATUS: DONE when build + targeted tests (incl. the updated sfu-client.spec.ts assertions) are green.
The B2b rung-3 rejoin still consumes `needs-rejoin` as planned; this change only ensures the mid-call path
also feeds that continuation instead of dying.

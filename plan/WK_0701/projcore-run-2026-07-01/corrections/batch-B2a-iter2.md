# B2a Correction — iter 2 (send-back, converging)

Validator codex55 iter-2: mid-call gap **CLEARED** ✓. ONE terminal give-up path remains — close it and we're done.

## The remaining gap (the LAST terminal-stop path)
The live-mid-conflict FALLBACK: initial subscribe hits a LiveMidConflictError → forced renegotiated retry
runs → that retry fails with a non-LiveMidConflictError while the peer is still admitted+advertising → the
catch (~sfu-client.service.ts:512-525) calls legacy `nextSubscribeRetry()`. On cap-exhaust, `nextSubscribeRetry`
(line ~414-417) logs "subscribe permanently stopped ... guard stays set until cfSessionId changes" and returns
`shouldRetry:false`. Because `if (!retry.shouldRetry) return` runs BEFORE `subscribedClientIds.delete(current.clientId)`,
the subscriber stays GUARDED + advertised-not-subscribed + NO low-freq continuation until cfSessionId changes = a
real terminal give-up (R2 never-give-up violation).

## The ask (close the class in ONE pass — no more whack-a-mole)
1. At the live-mid-conflict fallback catch (~line 512-525), when `nextSubscribeRetry()` returns
   `!shouldRetry` (capped): mirror the mid-call fix — do NOT bare-`return`. Instead, if
   `canRunSubscribeRecovery(current)` holds: `subscribedClientIds.delete(current.clientId)`, emit
   `needs-rejoin`, and `armSubscribeRecoveryLowFrequencyRetry(current.clientId)`. Never leave a latched
   advertised-not-subscribed guard while admitted+advertising.
2. **Confirm this is the LAST one.** `nextSubscribeRetry` is called ONLY at line ~525 (verify with
   `grep -n "nextSubscribeRetry(" sfu-client.service.ts` — definition + that single caller). After this fix,
   its terminal "permanently stopped" branch is no longer a terminal outcome for any live path. Grep the whole
   service for EVERY early `return` after a capped/!shouldRetry subscribe decision and confirm each one either
   (a) self-clears the guard AND awaits fresh state that will arrive, or (b) routes to the low-freq
   continuation. List what you checked in changes.md so we don't get an iter-3.
3. Add/extend a fake-timed test (coordinator spec) asserting the live-mid-conflict fallback cap-exhaust
   escalates to the low-freq continuation (needs-rejoin + armed + re-fires), not a permanent stop.
4. Preserve everything accepted (coordinator, epoch guard, rungs, mid-call fix). Wrap every test run in
   `timeout 25`. Re-emit STATUS: DONE when build + targeted tests are green AND terminate.

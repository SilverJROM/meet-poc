# Correction — B7 iter2 (2nd VALIDATED-FAIL by codex) — clean-context debug

You are the IMPLEMENTER (Sonnet) for the meet-poc SFU cutover, supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover`. Your context was just cleared — re-read what you need. THIS IS THE 2ND FAIL ON B7; a 3rd escalates to JROM. Get the root cause this time — don't guess.

## State (read these)
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md` — B0-B6b SFU mechanics.
- `frontend/src/app/services/sfu-client.service.ts`, `frontend/src/app/pages/room/room.page.ts` — your B7 work is committed at d2a8b0e (HEAD is later, your code is in those files).
- `frontend/src/app/services/sfu-mid-reconcile.ts` — the positional mid reconcile helper.
- `e2e/tests/sfu-b7-reconnect/sfu-reconnect.spec.ts` — the failing test.

## What's FIXED (leave alone)
- Deliberate-exit closes the SFU PC + idempotent — codex confirmed PASS both runs. Don't touch it.

## THE BUG (real, reproducible — fix THIS)
Codex ran the EXACT command below TWICE; the B7-drop test FAILED both times: after B drops & reconnects (new cfSession, B re-publishes), **A's `subscribedTracks` stays `0` for the full 180s timeout** (expected 2). This is NOT latency — 180s is plenty. A is **NEVER** re-subscribing to B's new session. Your retry-on-failure (subscribeRetryVersion) did not help because the subscribe is not THROWING — it's simply never being triggered, OR the round-trip never completes.

**FIRST: reproduce it.** Run the exact codex command and WATCH it fail (don't trust a prior green run — your self-test passed while codex's failed; reconcile that):
```
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7dbg.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

**THEN: trace the reconnect→re-subscribe chain on A's side and find WHERE it breaks.** Instrument/log (temporarily) each link:
1. After B reconnects + re-publishes, does **A receive `sfu-presence` for B's NEW cfSession/clientId**? (Is the server broadcasting B's re-publish to A? Does B actually re-publish + announce after resetForReconnect?)
2. Does A's subscription effect **re-fire** for B-new, and does **`subscribeIfNeeded(B-new)` actually call `doSubscribe`** (not get blocked by a guard)? Check: is `subscribedClientIds` keyed by clientId — and does B's OLD clientId linger and block B-new? Is the guard cleared for B on peer-resumed/removePeer?
3. Does `doSubscribe(B-new)` issue the `POST /api/sfu/tracks` (location:remote) + complete the renegotiation, and does `ontrack` fire so `subscribedTracks` reaches 2?
Find the exact broken link and fix the real cause. Likely suspects: (a) B doesn't actually re-publish/announce after reconnect, (b) A's removePeer(oldClientId) + new-presence ordering leaves B not subscribed, (c) a guard (subscribedClientIds / publish-status) blocks the re-subscribe, (d) the re-subscribe renegotiation on A's existing PC never completes.

## Constraints
- Reuse enqueue + reconcileSubscribedMids. Don't modify mesh webrtc.service.ts. Remove any temporary debug logging before committing (or keep it behind the existing diagnostics — your call, but keep the diff clean).
- The fix must make A reach `subscribedTracks===2` after B's reconnect, reliably, on BOTH runs.

## After fixing
Re-run the exact command TWICE (fresh MEET_DB_PATH each) — both must pass, no alternating failures. Callback FIRST `[projcore callback] B7 DONE ...`, commit before STATUS: DONE. In changes.md, state the EXACT broken link you found + the fix. If after genuine tracing you find this is a real-CF/headless limitation that cannot be made deterministic (not a logic bug), STATUS: BLOCKED with the trace evidence so projcore can escalate to JROM — do NOT fake it green.
